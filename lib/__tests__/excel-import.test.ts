import * as XLSX from 'xlsx'
import { describe, it, expect } from 'vitest'
import { parsePnrExcelBuffer } from '../excel-import'
import {
  isHeaderRow, normalizePastedRows, validatePastedRows,
  parseMultiSectorPaste, groupMultiSectorRows, validatePNRGroups,
  AIRLINE_CODES, AIRPORT_CODES,
  type SectorTemplate,
} from '../paste-excel'

// ─── Helper: build an ArrayBuffer from array-of-arrays ────────────────────────
function makeXLSX(data: (string | number)[][], sheetName = 'PNR'): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  // In Node/Vitest, XLSX.write type:'buffer' returns a Node.js Buffer
  const nodeBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  // Copy into a standalone ArrayBuffer so parsePnrExcelBuffer can read it
  return new Uint8Array(nodeBuf).buffer as ArrayBuffer
}

// ─── Sector templates ─────────────────────────────────────────────────────────
const tmpl2: SectorTemplate[] = [
  { seq: 1, sectorType: 'Outbound', airlineCode: 'TG', flightNo: 'TG640', depAirportCode: 'BKK', arrAirportCode: 'NRT', depTime: '08:00', arrTime: '16:00', plusDay: 0, dayOffset: 0 },
  { seq: 2, sectorType: 'Return',   airlineCode: 'TG', flightNo: 'TG641', depAirportCode: 'NRT', arrAirportCode: 'BKK', depTime: '17:00', arrTime: '22:00', plusDay: 0, dayOffset: 4 },
]

const tmpl3: SectorTemplate[] = [
  { seq: 1, sectorType: 'Outbound', airlineCode: 'TG', flightNo: 'TG701', depAirportCode: 'BKK', arrAirportCode: 'NRT', depTime: '23:00', arrTime: '16:00', plusDay: 1, dayOffset: 0 },
  { seq: 2, sectorType: 'Transit',  airlineCode: 'TG', flightNo: 'TG999', depAirportCode: 'NRT', arrAirportCode: 'CTS', depTime: '08:00', arrTime: '10:00', plusDay: 0, dayOffset: 1 },
  { seq: 3, sectorType: 'Return',   airlineCode: 'TG', flightNo: 'TG702', depAirportCode: 'CTS', arrAirportCode: 'BKK', depTime: '17:00', arrTime: '22:00', plusDay: 0, dayOffset: 6 },
]

// ─── parsePnrExcelBuffer ──────────────────────────────────────────────────────
describe('parsePnrExcelBuffer', () => {
  it('คืน string[][] จาก Sheet ชื่อ PNR', () => {
    const buf = makeXLSX([
      ['PNR', 'Seat', 'วันไป'],
      ['SD1SD2', '36', '10/10/2026'],
    ])
    const rows = parsePnrExcelBuffer(buf)
    expect(rows).toHaveLength(2)
    expect(rows[0][0]).toBe('PNR')
    expect(rows[1][0]).toBe('SD1SD2')
  })

  it('ถ้าไม่มี Sheet ชื่อ PNR ใช้ Sheet แรก', () => {
    const buf = makeXLSX([['A', 'B'], ['1', '2']], 'Data')
    const rows = parsePnrExcelBuffer(buf)
    expect(rows).toHaveLength(2)
    expect(rows[0][0]).toBe('A')
  })

  it('กรองแถวว่างออก', () => {
    const buf = makeXLSX([
      ['PNR', 'Seat'],
      ['', ''],
      ['SD1SD2', '36'],
      ['', ''],
    ])
    const rows = parsePnrExcelBuffer(buf)
    expect(rows).toHaveLength(2)  // header + data (empty rows filtered)
  })

  it('trim whitespace ใน cell', () => {
    const buf = makeXLSX([['  SD1SD2  ', '  36  ', '  10/10/2026  ']])
    const rows = parsePnrExcelBuffer(buf)
    expect(rows[0][0]).toBe('SD1SD2')
    expect(rows[0][1]).toBe('36')
  })

  it('คืน [] ถ้าไม่มีข้อมูล', () => {
    const buf = makeXLSX([])
    const rows = parsePnrExcelBuffer(buf)
    expect(rows).toHaveLength(0)
  })

  it('Numeric cell ถูกแปลงเป็น string', () => {
    const buf = makeXLSX([['PNR', 'Seat'], ['SD1SD2', 36]])
    const rows = parsePnrExcelBuffer(buf)
    expect(typeof rows[1][1]).toBe('string')
    expect(rows[1][1]).toBe('36')
  })
})

// ─── 2-Sector Import Flow ─────────────────────────────────────────────────────
describe('Import Excel — 2-Sector mode', () => {
  const H2 = ['PNR','Seat','วันไป','Flight ไป','From (ไป)','To (ไป)','วันกลับ','Flight กลับ','From (กลับ)','To (กลับ)']

  function make2S(rows: (string | number)[][]): ArrayBuffer {
    return makeXLSX([H2, ...rows])
  }

  it('import 1 PNR ตาม template → READY', () => {
    const buf = make2S([
      ['SD1SD2','36','10/10/2026','TG640','BKK','NRT','14/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    expect(isHeaderRow(raw[0])).toBe(true)
    const normalized = normalizePastedRows(raw, true)
    const result = validatePastedRows(normalized, [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('READY')
    expect(result[0].data.pnrCode).toBe('SD1SD2')
    expect(result[0].data.seatCount).toBe(36)
    expect(result[0].data.outboundDate).toBe('2026-10-10')
    expect(result[0].data.outboundFlight).toBe('TG640')
    expect(result[0].data.returnDate).toBe('2026-10-14')
  })

  it('import หลาย PNR → ทุกแถว valid', () => {
    const buf = make2S([
      ['SD1SD2','36','10/10/2026','TG640','BKK','NRT','14/10/2026','TG641','NRT','BKK'],
      ['XY9XY9','40','17/10/2026','TG640','BKK','NRT','21/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const result = validatePastedRows(normalizePastedRows(raw, true), [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(result).toHaveLength(2)
    result.forEach(r => expect(r.status).toBe('READY'))
  })

  it('PNR ว่าง → Dummy PNR, WARNING ไม่ใช่ ERROR', () => {
    const buf = make2S([
      ['','36','10/10/2026','TG640','BKK','NRT','14/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const result = validatePastedRows(normalizePastedRows(raw, true), [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(result[0].data.isDummy).toBe(true)
    expect(result[0].status).toBe('WARNING')
    expect(result[0].errors.some(e => e.col === 'PNR')).toBe(false)
  })

  it('PNR ว่างหลายแถว → แต่ละแถวคือ Dummy PNR แยกกัน', () => {
    const buf = make2S([
      ['','36','10/10/2026','TG640','BKK','NRT','14/10/2026','TG641','NRT','BKK'],
      ['','40','17/10/2026','TG640','BKK','NRT','21/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const result = validatePastedRows(normalizePastedRows(raw, true), [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(result).toHaveLength(2)
    result.forEach(r => {
      expect(r.data.isDummy).toBe(true)
      expect(r.status).toBe('WARNING')
    })
  })

  it('Flight ไม่ตรง Step 2 → ERROR fieldErrors.outboundFlight', () => {
    const buf = make2S([
      ['SD1SD2','36','10/10/2026','TG999','BKK','NRT','14/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const result = validatePastedRows(normalizePastedRows(raw, true), [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(result[0].fieldErrors.outboundFlight).toBeTruthy()
    expect(result[0].fieldErrors.outboundFlight).toContain('TG640')
    expect(result[0].status).toBe('ERROR')
  })

  it('From ไม่ตรง Step 2 → ERROR fieldErrors.outboundFrom', () => {
    const buf = make2S([
      ['SD1SD2','36','10/10/2026','TG640','DMK','NRT','14/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const result = validatePastedRows(normalizePastedRows(raw, true), [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(result[0].fieldErrors.outboundFrom).toBeTruthy()
    expect(result[0].fieldErrors.outboundFrom).toContain('BKK')
  })

  it('วันกลับไม่ตรง Day Offset → ERROR fieldErrors.returnDate', () => {
    // dayOffset=4 → expected 2026-10-14 แต่ใส่ 2026-10-20
    const buf = make2S([
      ['SD1SD2','36','10/10/2026','TG640','BKK','NRT','20/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const result = validatePastedRows(normalizePastedRows(raw, true), [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(result[0].fieldErrors.returnDate).toBeTruthy()
    expect(result[0].fieldErrors.returnDate).toContain('2026-10-14')
  })

  it('PNR ซ้ำในไฟล์ → ERROR ช่อง pnrCode', () => {
    const buf = make2S([
      ['SAME','36','10/10/2026','TG640','BKK','NRT','14/10/2026','TG641','NRT','BKK'],
      ['SAME','36','17/10/2026','TG640','BKK','NRT','21/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const result = validatePastedRows(normalizePastedRows(raw, true), [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(result[1].fieldErrors.pnrCode).toBeTruthy()
    expect(result[1].status).toBe('ERROR')
  })

  it('PNR ซ้ำกับระบบ → ERROR', () => {
    const buf = make2S([
      ['EXIST','36','10/10/2026','TG640','BKK','NRT','14/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const result = validatePastedRows(normalizePastedRows(raw, true), ['EXIST'], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(result[0].fieldErrors.pnrCode).toBeTruthy()
    expect(result[0].status).toBe('ERROR')
  })

  it('Seat = 0 → ERROR ช่อง seatCount', () => {
    const buf = make2S([
      ['SD1SD2','0','10/10/2026','TG640','BKK','NRT','14/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const result = validatePastedRows(normalizePastedRows(raw, true), [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(result[0].fieldErrors.seatCount).toBeTruthy()
    expect(result[0].status).toBe('ERROR')
  })

  it('Cell ผิดแสดง fieldErrors + แก้แล้ว Error หาย', () => {
    const buf = make2S([
      ['SD1SD2','36','10/10/2026','TG999','BKK','NRT','14/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const bad = validatePastedRows(normalizePastedRows(raw, true), [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(bad[0].fieldErrors.outboundFlight).toBeTruthy()

    const fixed = { ...bad[0].data, outboundFlight: 'TG640', outboundAirlineCode: 'TG' }
    const good  = validatePastedRows([fixed], [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(good[0].fieldErrors.outboundFlight).toBeUndefined()
    expect(good[0].status).toBe('READY')
  })

  it('Dummy PNR ไม่บล็อก canConfirm (errorCount = 0)', () => {
    const buf = make2S([
      ['','36','10/10/2026','TG640','BKK','NRT','14/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const result = validatePastedRows(normalizePastedRows(raw, true), [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    const errorCount = result.filter(r => r.status === 'ERROR').length
    expect(errorCount).toBe(0)
  })

  it('ข้อมูลไม่ถูก Review ก่อน — validatePastedRows คืน in-memory ไม่เขียน DB', () => {
    const buf = make2S([
      ['SD1SD2','36','10/10/2026','TG640','BKK','NRT','14/10/2026','TG641','NRT','BKK'],
    ])
    const raw = parsePnrExcelBuffer(buf)
    const result = validatePastedRows(normalizePastedRows(raw, true), [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    // ยังไม่มี id หรือ created_at — ยังไม่ได้บันทึก DB
    expect((result[0] as unknown as Record<string, unknown>).id).toBeUndefined()
  })
})

// ─── Multi-Sector (3–9 Sector) Import Flow ───────────────────────────────────
describe('Import Excel — Multi-Sector (3+ Sector)', () => {
  const HN = ['Import Group','PNR','Seat','Seq','วันที่','Flight','From','To','เวลาออก','เวลาถึง','+Day']

  function makeMS(rows: (string | number)[][]): ArrayBuffer {
    return makeXLSX([HN, ...rows])
  }

  function validRow3(importGroup = 'G1', pnr = '', seq = 1): (string | number)[] {
    const data: Record<number, (string | number)[]> = {
      1: [importGroup, pnr, 36, 1, '10/10/2026', 'TG701', 'BKK', 'NRT', '23:00', '16:00', 1],
      2: [importGroup, pnr, 36, 2, '11/10/2026', 'TG999', 'NRT', 'CTS', '08:00', '10:00', 0],
      3: [importGroup, pnr, 36, 3, '16/10/2026', 'TG702', 'CTS', 'BKK', '17:00', '22:00', 0],
    }
    return data[seq] ?? data[1]
  }

  it('import 3-Sector Dummy PNR → WARNING ไม่ใช่ ERROR', () => {
    const buf = makeMS([validRow3('G1','',1), validRow3('G1','',2), validRow3('G1','',3)])
    const raw  = parsePnrExcelBuffer(buf)
    const ms   = parseMultiSectorPaste(raw, true)
    const rg   = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result).toHaveLength(1)
    expect(result[0].isDummy).toBe(true)
    expect(result[0].status).toBe('WARNING')
    expect(result[0].sectors).toHaveLength(3)
  })

  it('import 3-Sector มี PNR → READY', () => {
    const buf = makeMS([validRow3('','ABCDEF',1), validRow3('','ABCDEF',2), validRow3('','ABCDEF',3)])
    const raw  = parsePnrExcelBuffer(buf)
    const ms   = parseMultiSectorPaste(raw, true)
    const rg   = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('READY')
    expect(result[0].isDummy).toBe(false)
  })

  it('Import Group รวม Sector ของ Dummy PNR เดียวกัน', () => {
    const buf = makeMS([
      ['G1','',36,1,'10/10/2026','TG701','BKK','NRT','23:00','16:00',1],
      ['G1','',36,2,'11/10/2026','TG999','NRT','CTS','08:00','10:00',0],
      ['G1','',36,3,'16/10/2026','TG702','CTS','BKK','17:00','22:00',0],
      ['G2','',36,1,'10/10/2026','TG701','BKK','NRT','23:00','16:00',1],
      ['G2','',36,2,'11/10/2026','TG999','NRT','CTS','08:00','10:00',0],
      ['G2','',36,3,'16/10/2026','TG702','CTS','BKK','17:00','22:00',0],
    ])
    const raw  = parsePnrExcelBuffer(buf)
    const ms   = parseMultiSectorPaste(raw, true)
    const rg   = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result).toHaveLength(2)
    expect(result[0].groupKey).toBe('G1')
    expect(result[1].groupKey).toBe('G2')
    result.forEach(r => {
      expect(r.sectors).toHaveLength(3)
      expect(r.isDummy).toBe(true)
    })
  })

  it('จำนวน Sector ขาด → ERROR', () => {
    const buf = makeMS([
      validRow3('G1','',1),
      validRow3('G1','',2),
      // Sector 3 หาย
    ])
    const raw  = parsePnrExcelBuffer(buf)
    const ms   = parseMultiSectorPaste(raw, true)
    const rg   = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
    expect(result[0].errors.some(e => e.col === 'จำนวน Sector')).toBe(true)
    expect(result[0].errors[0].message).toContain('3')
  })

  it('Seq ซ้ำกันใน PNR เดียว → ERROR ช่อง seq', () => {
    const buf = makeMS([
      ['G1','',36,1,'10/10/2026','TG701','BKK','NRT','23:00','16:00',1],
      ['G1','',36,1,'11/10/2026','TG999','NRT','CTS','08:00','10:00',0],  // Seq 1 ซ้ำ
      ['G1','',36,3,'16/10/2026','TG702','CTS','BKK','17:00','22:00',0],
    ])
    const raw  = parsePnrExcelBuffer(buf)
    const ms   = parseMultiSectorPaste(raw, true)
    const rg   = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[0].seq).toBeTruthy()
    expect(result[0].sectorFieldErrors[1].seq).toBeTruthy()
  })

  it('Flight ไม่ตรง Step 2 → ERROR ช่อง flightNo', () => {
    const buf = makeMS([
      ['G1','',36,1,'10/10/2026','TG000','BKK','NRT','23:00','16:00',1],  // Flight ผิด
      validRow3('G1','',2),
      validRow3('G1','',3),
    ])
    const raw    = parsePnrExcelBuffer(buf)
    const ms     = parseMultiSectorPaste(raw, true)
    const rg     = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[0].flightNo).toBeTruthy()
    expect(result[0].sectorFieldErrors[0].flightNo).toContain('TG701')
  })

  it('From ไม่ตรง Step 2 → ERROR ช่อง depAirportCode', () => {
    const buf = makeMS([
      ['G1','',36,1,'10/10/2026','TG701','DMK','NRT','23:00','16:00',1],  // From ผิด
      validRow3('G1','',2),
      validRow3('G1','',3),
    ])
    const raw    = parsePnrExcelBuffer(buf)
    const ms     = parseMultiSectorPaste(raw, true)
    const rg     = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[0].depAirportCode).toBeTruthy()
    expect(result[0].sectorFieldErrors[0].depAirportCode).toContain('BKK')
  })

  it('วันที่ไม่ตรง Day Offset → ERROR ช่อง travelDate', () => {
    const buf = makeMS([
      validRow3('G1','',1),
      ['G1','',36,2,'12/10/2026','TG999','NRT','CTS','08:00','10:00',0],  // dayOffset=1 คาดหวัง 11/10
      validRow3('G1','',3),
    ])
    const raw    = parsePnrExcelBuffer(buf)
    const ms     = parseMultiSectorPaste(raw, true)
    const rg     = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[1].travelDate).toBeTruthy()
    expect(result[0].sectorFieldErrors[1].travelDate).toContain('2026-10-11')
  })

  it('Import Group ว่าง + PNR ว่าง → ERROR', () => {
    const buf = makeMS([
      ['','',36,1,'10/10/2026','TG701','BKK','NRT','23:00','16:00',1],
    ])
    const raw    = parsePnrExcelBuffer(buf)
    const ms     = parseMultiSectorPaste(raw, true)
    const rg     = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
    expect(result[0].errors.some(e => e.col === 'Import Group')).toBe(true)
  })

  it('PNR ซ้ำในไฟล์ → ERROR', () => {
    const buf = makeMS([
      ['','DUPEPNR',36,1,'10/10/2026','TG701','BKK','NRT','23:00','16:00',1],
      ['','DUPEPNR',36,2,'11/10/2026','TG999','NRT','CTS','08:00','10:00',0],
      ['','DUPEPNR',36,3,'16/10/2026','TG702','CTS','BKK','17:00','22:00',0],
      ['','DUPEPNR',36,1,'10/10/2026','TG701','BKK','NRT','23:00','16:00',1],
      ['','DUPEPNR',36,2,'11/10/2026','TG999','NRT','CTS','08:00','10:00',0],
      ['','DUPEPNR',36,3,'16/10/2026','TG702','CTS','BKK','17:00','22:00',0],
    ])
    const raw    = parsePnrExcelBuffer(buf)
    const ms     = parseMultiSectorPaste(raw, true)
    const rg     = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    // second group with same PNR should error
    const errorGroups = result.filter(r => r.status === 'ERROR')
    expect(errorGroups.length).toBeGreaterThan(0)
  })

  it('แก้ Cell แล้ว Error หาย', () => {
    const buf = makeMS([
      ['G1','',36,1,'10/10/2026','TG000','BKK','NRT','23:00','16:00',1],  // Flight ผิด
      validRow3('G1','',2),
      validRow3('G1','',3),
    ])
    const raw  = parsePnrExcelBuffer(buf)
    const ms   = parseMultiSectorPaste(raw, true)
    const rg   = groupMultiSectorRows(ms)
    const bad  = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(bad[0].sectorFieldErrors[0].flightNo).toBeTruthy()

    // แก้ Flight ให้ถูก
    bad[0].sectors[0] = { ...bad[0].sectors[0], flightNo: 'TG701', airlineCode: 'TG' }
    const rg2  = groupMultiSectorRows(bad.flatMap(g => g.sectors))
    const good = validatePNRGroups(rg2, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(good[0].sectorFieldErrors[0].flightNo).toBeUndefined()
    expect(good[0].status).toBe('WARNING')  // isDummy → WARNING
  })

  it('Dummy PNR ที่ถูกต้องทั้งหมด → canConfirm (errorCount=0)', () => {
    const buf = makeMS([validRow3('G1','',1), validRow3('G1','',2), validRow3('G1','',3)])
    const raw  = parsePnrExcelBuffer(buf)
    const ms   = parseMultiSectorPaste(raw, true)
    const rg   = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    const errorCount = result.filter(r => r.status === 'ERROR').length
    expect(errorCount).toBe(0)
  })

  it('ป้องกัน Double Submit — validatePNRGroups คืน in-memory เท่านั้น', () => {
    const buf = makeMS([validRow3('G1','',1), validRow3('G1','',2), validRow3('G1','',3)])
    const raw  = parsePnrExcelBuffer(buf)
    const ms   = parseMultiSectorPaste(raw, true)
    const rg   = groupMultiSectorRows(ms)
    const r1   = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    const r2   = validatePNRGroups(rg, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    // เรียกซ้ำ 2 ครั้ง → ไม่สร้าง duplicate (state อยู่ใน React, ไม่ใช่ฟังก์ชัน)
    expect(r1[0].groupKey).toBe(r2[0].groupKey)
    expect(r1).toHaveLength(r2.length)
  })

  it('5 Sector: import ครบ 5 Sector → groups ถูกต้อง', () => {
    const tmpl5: SectorTemplate[] = Array.from({ length: 5 }, (_, i) => ({
      seq: i + 1, sectorType: i === 4 ? 'Return' : 'Outbound',
      airlineCode: 'TG', flightNo: `TG${700 + i}`,
      depAirportCode: 'BKK', arrAirportCode: 'NRT',
      depTime: '08:00', arrTime: '16:00', plusDay: 0, dayOffset: i,
    }))
    const rows5: (string | number)[][] = Array.from({ length: 5 }, (_, i) => [
      'G1', '', 36, i + 1,
      `${10 + i}/10/2026`,
      `TG${700 + i}`, 'BKK', 'NRT', '08:00', '16:00', 0,
    ])
    const buf  = makeXLSX([HN, ...rows5])
    const raw  = parsePnrExcelBuffer(buf)
    const ms   = parseMultiSectorPaste(raw, true)
    const rg   = groupMultiSectorRows(ms)
    const result = validatePNRGroups(rg, [], tmpl5, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectors).toHaveLength(5)
  })
})
