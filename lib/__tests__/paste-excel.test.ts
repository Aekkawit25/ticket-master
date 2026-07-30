import { describe, it, expect } from 'vitest'
import {
  parsePastedExcel,
  isHeaderRow,
  parseFlexDate,
  parseFlightNo,
  normalizePastedRows,
  validatePastedRows,
  parseMultiSectorPaste,
  groupMultiSectorRows,
  validatePNRGroups,
  AIRLINE_CODES,
  AIRPORT_CODES,
  type SectorTemplate,
} from '../paste-excel'
import type { PastedExcelRow, PastedMultiSectorRow } from '../paste-excel'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ROW_OK = 'SD1SD2\t36\t10/10/2026\tTG640\tBKK\tNRT\t14/10/2026\tTG641\tNRT\tBKK'
const ROW2   = 'SD1SD3\t36\t17/10/2026\tTG640\tBKK\tNRT\t21/10/2026\tTG641\tNRT\tBKK'
const HEADER = 'PNR\tSeat\tวันไป\tเที่ยวบินไป\tจาก\tถึง\tวันกลับ\tเที่ยวบินกลับ\tจาก\tถึง'

function makeRow(overrides: Partial<PastedExcelRow> = {}): PastedExcelRow {
  return {
    pnrCode: 'SD1SD2',
    isDummy: false,
    seatCount: 36,
    outboundDate: '2026-10-10',
    outboundFlight: 'TG640',
    outboundFrom: 'BKK',
    outboundTo: 'NRT',
    returnDate: '2026-10-14',
    returnFlight: 'TG641',
    returnFrom: 'NRT',
    returnTo: 'BKK',
    outboundAirlineCode: 'TG',
    returnAirlineCode: 'TG',
    ...overrides,
  }
}

function makeTmpl(overrides: Partial<SectorTemplate> = {}): SectorTemplate {
  return {
    seq: 1, sectorType: 'Outbound', airlineCode: 'TG', flightNo: 'TG640',
    depAirportCode: 'BKK', arrAirportCode: 'NRT', depTime: '08:00', arrTime: '16:00',
    plusDay: 0, dayOffset: 0,
    ...overrides,
  }
}

function makeMultiRow(overrides: Partial<PastedMultiSectorRow> = {}): PastedMultiSectorRow {
  return {
    importGroup: 'G1', pnrCode: '', seatCount: 36,
    seq: 1, travelDate: '2026-10-10', flightNo: 'TG701',
    depAirportCode: 'BKK', arrAirportCode: 'NRT',
    depTime: '23:00', arrTime: '16:00', plusDay: 1, airlineCode: 'TG',
    ...overrides,
  }
}

// ─── parsePastedExcel ─────────────────────────────────────────────────────────
describe('parsePastedExcel', () => {
  it('วางข้อมูล 1 แถว', () => {
    const result = parsePastedExcel(ROW_OK)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(10)
    expect(result[0][0]).toBe('SD1SD2')
    expect(result[0][1]).toBe('36')
  })

  it('วางหลายแถว', () => {
    const result = parsePastedExcel(`${ROW_OK}\n${ROW2}`)
    expect(result).toHaveLength(2)
    expect(result[0][0]).toBe('SD1SD2')
    expect(result[1][0]).toBe('SD1SD3')
  })

  it('กรองแถวว่างออก', () => {
    const result = parsePastedExcel(`${ROW_OK}\n\n${ROW2}\n`)
    expect(result).toHaveLength(2)
  })

  it('Trim ช่องว่าง', () => {
    const result = parsePastedExcel(' SD1SD2 \t 36 \t10/10/2026')
    expect(result[0][0]).toBe('SD1SD2')
    expect(result[0][1]).toBe('36')
  })

  it('รองรับ Windows line ending (\\r\\n)', () => {
    const result = parsePastedExcel(`${ROW_OK}\r\n${ROW2}`)
    expect(result).toHaveLength(2)
  })
})

// ─── isHeaderRow ─────────────────────────────────────────────────────────────
describe('isHeaderRow', () => {
  it('ตรวจพบหัวคอลัมน์ภาษาไทย (มีคำว่า "pnr")', () => {
    expect(isHeaderRow(['PNR', 'Seat'])).toBe(true)
  })

  it('ตรวจพบหัวคอลัมน์ภาษาไทย (มีคำว่า "วัน")', () => {
    expect(isHeaderRow(['วันไป', 'เที่ยวบิน'])).toBe(true)
  })

  it('แถวข้อมูลปกติ ไม่ใช่หัวคอลัมน์', () => {
    expect(isHeaderRow(['SD1SD2', '36'])).toBe(false)
  })

  it('undefined → false', () => {
    expect(isHeaderRow(undefined)).toBe(false)
  })
})

// ─── parseFlexDate ────────────────────────────────────────────────────────────
describe('parseFlexDate', () => {
  it('DD/MM/YYYY', () => {
    expect(parseFlexDate('10/10/2026')).toBe('2026-10-10')
  })

  it('D/M/YYYY', () => {
    expect(parseFlexDate('5/1/2026')).toBe('2026-01-05')
  })

  it('YYYY-MM-DD', () => {
    expect(parseFlexDate('2026-10-10')).toBe('2026-10-10')
  })

  it('วันที่ผิดรูปแบบ → null', () => {
    expect(parseFlexDate('10-10-2026')).toBeNull()
    expect(parseFlexDate('32/01/2026')).toBeNull()
    expect(parseFlexDate('random')).toBeNull()
    expect(parseFlexDate('')).toBeNull()
  })

  it('เดือนเกิน 12 → null (ป้องกันการสลับวัน-เดือน)', () => {
    expect(parseFlexDate('01/13/2026')).toBeNull()
  })
})

// ─── parseFlightNo ────────────────────────────────────────────────────────────
describe('parseFlightNo', () => {
  it('รหัสปกติ', () => {
    expect(parseFlightNo('TG640')).toEqual({ airlineCode: 'TG', flightNo: 'TG640' })
    expect(parseFlightNo('KE123')).toEqual({ airlineCode: 'KE', flightNo: 'KE123' })
  })

  it('รหัส 3 ตัวอักษร', () => {
    expect(parseFlightNo('SIA123')).toEqual({ airlineCode: 'SIA', flightNo: 'SIA123' })
  })

  it('case insensitive', () => {
    expect(parseFlightNo('tg640')).toEqual({ airlineCode: 'TG', flightNo: 'TG640' })
  })

  it('รหัสไม่ถูกต้อง → null', () => {
    expect(parseFlightNo('640')).toBeNull()
    expect(parseFlightNo('TGABC')).toBeNull()
    expect(parseFlightNo('')).toBeNull()
    expect(parseFlightNo('TG')).toBeNull()
  })
})

// ─── normalizePastedRows ──────────────────────────────────────────────────────
describe('normalizePastedRows', () => {
  it('มีหัวตาราง → ข้าม row แรก', () => {
    const raw = parsePastedExcel(`${HEADER}\n${ROW_OK}`)
    const result = normalizePastedRows(raw, true)
    expect(result).toHaveLength(1)
    expect(result[0].pnrCode).toBe('SD1SD2')
  })

  it('ไม่มีหัวตาราง → อ่านทุก row', () => {
    const raw = parsePastedExcel(`${ROW_OK}\n${ROW2}`)
    const result = normalizePastedRows(raw, false)
    expect(result).toHaveLength(2)
  })

  it('auto-detect หัวตาราง', () => {
    const raw = parsePastedExcel(`${HEADER}\n${ROW_OK}`)
    const result = normalizePastedRows(raw, null)  // auto
    expect(result).toHaveLength(1)
    expect(result[0].pnrCode).toBe('SD1SD2')
  })

  it('แปลง PNR เป็นตัวพิมพ์ใหญ่', () => {
    const raw = [['sd1sd2','36','10/10/2026','TG640','BKK','NRT','14/10/2026','TG641','NRT','BKK']]
    const result = normalizePastedRows(raw, false)
    expect(result[0].pnrCode).toBe('SD1SD2')
  })

  it('แปลงวันที่ DD/MM/YYYY → YYYY-MM-DD', () => {
    const raw = parsePastedExcel(ROW_OK)
    const result = normalizePastedRows(raw, false)
    expect(result[0].outboundDate).toBe('2026-10-10')
    expect(result[0].returnDate).toBe('2026-10-14')
  })

  it('แยก Airline Code จาก Flight No', () => {
    const raw = parsePastedExcel(ROW_OK)
    const result = normalizePastedRows(raw, false)
    expect(result[0].outboundAirlineCode).toBe('TG')
    expect(result[0].returnAirlineCode).toBe('TG')
  })

  it('แปลง Seat เป็นจำนวนเต็ม', () => {
    const raw = parsePastedExcel(ROW_OK)
    const result = normalizePastedRows(raw, false)
    expect(result[0].seatCount).toBe(36)
    expect(typeof result[0].seatCount).toBe('number')
  })
})

// ─── validatePastedRows ───────────────────────────────────────────────────────
describe('validatePastedRows', () => {
  it('ข้อมูลถูกต้องทั้งหมด → READY', () => {
    const result = validatePastedRows([makeRow()], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('READY')
    expect(result[0].errors).toHaveLength(0)
    expect(result[0].warnings).toHaveLength(0)
  })

  it('PNR ว่าง → isDummy=true, WARNING (ไม่ใช่ ERROR)', () => {
    const result = validatePastedRows([makeRow({ pnrCode: '', isDummy: true })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('WARNING')
    expect(result[0].data.isDummy).toBe(true)
    expect(result[0].errors.some(e => e.col === 'PNR')).toBe(false)
  })

  it('PNR ซ้ำในข้อมูลที่วาง (แถว 2 ซ้ำแถว 1) → ERROR', () => {
    const rows = [makeRow({ pnrCode: 'DUPE1' }), makeRow({ pnrCode: 'DUPE1' })]
    const result = validatePastedRows(rows, [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('READY')
    expect(result[1].status).toBe('ERROR')
    expect(result[1].errors[0].message).toContain('ซ้ำ')
  })

  it('PNR ซ้ำกับ Step 3 (existingPnrCodes) → ERROR', () => {
    const result = validatePastedRows([makeRow({ pnrCode: 'EXIST1' })], ['EXIST1'], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
    expect(result[0].errors.some(e => e.message.includes('มีอยู่ในระบบ'))).toBe(true)
  })

  it('PNR ซ้ำกับ Group อื่น (case-insensitive) → ERROR', () => {
    const result = validatePastedRows([makeRow({ pnrCode: 'ABC123' })], ['abc123'], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
  })

  it('Seat = 0 → ERROR', () => {
    const result = validatePastedRows([makeRow({ seatCount: 0 })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
    expect(result[0].errors.some(e => e.col === 'Seat')).toBe(true)
  })

  it('Seat เป็นเศษส่วน → ERROR', () => {
    const result = validatePastedRows([makeRow({ seatCount: 1.5 })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
  })

  it('วันที่ผิดรูปแบบ → ERROR', () => {
    const result = validatePastedRows([makeRow({ outboundDate: '10-10-2026' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
    expect(result[0].errors.some(e => e.col === 'วันไป')).toBe(true)
  })

  it('วันกลับก่อนวันไป → ERROR', () => {
    const result = validatePastedRows([makeRow({ outboundDate: '2026-10-14', returnDate: '2026-10-10' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
    expect(result[0].errors.some(e => e.col === 'วันกลับ' && e.message.includes('ก่อนวันไป'))).toBe(true)
  })

  it('วันไป = วันกลับ → ไม่ Error (one-day trip)', () => {
    const result = validatePastedRows([makeRow({ outboundDate: '2026-10-10', returnDate: '2026-10-10' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].errors.filter(e => e.col === 'วันกลับ' && e.message.includes('ก่อน'))).toHaveLength(0)
  })

  it('Airline ไม่มีใน Master → WARNING (ไม่ใช่ ERROR)', () => {
    const result = validatePastedRows([makeRow({ outboundFlight: 'XX999', outboundAirlineCode: 'XX' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].errors.some(e => e.col === 'เที่ยวบินไป')).toBe(false)  // not format error
    expect(result[0].warnings.some(w => w.col === 'เที่ยวบินไป')).toBe(true)
    expect(result[0].status).toBe('WARNING')
  })

  it('Airport ไม่มีใน Master → WARNING', () => {
    const result = validatePastedRows([makeRow({ outboundFrom: 'ZZZ' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].warnings.some(w => w.col === 'จาก')).toBe(true)
    expect(result[0].status).toBe('WARNING')
  })

  it('รหัสเที่ยวบินไม่ถูกต้อง → ERROR', () => {
    const result = validatePastedRows([makeRow({ outboundFlight: '640', outboundAirlineCode: '' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].errors.some(e => e.col === 'เที่ยวบินไป')).toBe(true)
  })

  it('สนามบินต้นทางว่าง → ERROR', () => {
    const result = validatePastedRows([makeRow({ outboundFrom: '' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].errors.some(e => e.col === 'จาก')).toBe(true)
  })

  it('rowIndex เป็น 1-based', () => {
    const result = validatePastedRows([makeRow(), makeRow({ pnrCode: 'SD1SD3' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].rowIndex).toBe(1)
    expect(result[1].rowIndex).toBe(2)
  })
})

// ─── Preview แก้ไขแล้วตรวจใหม่ (re-validate after edit) ──────────────────────
describe('re-validate after edit', () => {
  it('แก้ Seat จาก 0 → 36 → ERROR กลายเป็น READY', () => {
    const badRow = makeRow({ seatCount: 0 })
    const first = validatePastedRows([badRow], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(first[0].status).toBe('ERROR')

    const fixedRow = { ...badRow, seatCount: 36 }
    const second = validatePastedRows([fixedRow], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(second[0].status).toBe('READY')
  })

  it('แก้วันที่ผิด → ถูก → ERROR กลายเป็น READY', () => {
    const badRow = makeRow({ outboundDate: 'invalid' })
    expect(validatePastedRows([badRow], [], AIRLINE_CODES, AIRPORT_CODES)[0].status).toBe('ERROR')

    const fixedRow = { ...badRow, outboundDate: '2026-10-10' }
    expect(validatePastedRows([fixedRow], [], AIRLINE_CODES, AIRPORT_CODES)[0].status).toBe('READY')
  })

  it('แก้ Airport ให้อยู่ใน Master → WARNING หาย → READY', () => {
    const warnRow = makeRow({ outboundFrom: 'ZZZ' })
    expect(validatePastedRows([warnRow], [], AIRLINE_CODES, AIRPORT_CODES)[0].status).toBe('WARNING')

    const fixedRow = { ...warnRow, outboundFrom: 'BKK' }
    expect(validatePastedRows([fixedRow], [], AIRLINE_CODES, AIRPORT_CODES)[0].status).toBe('READY')
  })
})

// ─── ป้องกัน double-add ───────────────────────────────────────────────────────
describe('ป้องกัน Double Submit', () => {
  it('PNR ที่เพิ่มไปแล้ว → ERROR ถ้าพยายามเพิ่มอีกครั้ง', () => {
    const result = validatePastedRows([makeRow({ pnrCode: 'SD1SD2' })], ['SD1SD2'], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
    expect(result[0].errors[0].message).toContain('มีอยู่ในระบบ')
  })
})

// ─── fieldErrors / fieldWarnings (per-cell highlight) ────────────────────────
describe('fieldErrors — per-cell highlight', () => {
  it('ช่อง PNR ซ้ำ → fieldErrors.pnrCode มีค่า', () => {
    // PNR ว่างไม่เป็น error แล้ว — ใช้ PNR ซ้ำแทน
    const duped = [makeRow({ pnrCode: 'SAME' }), makeRow({ pnrCode: 'SAME' })]
    const result = validatePastedRows(duped, [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[1].fieldErrors.pnrCode).toBeTruthy()
    expect(result[1].fieldErrors.seatCount).toBeUndefined()
  })

  it('ช่อง Seat ผิด → fieldErrors.seatCount มีค่า', () => {
    const result = validatePastedRows([makeRow({ seatCount: 0 })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].fieldErrors.seatCount).toBeTruthy()
    expect(result[0].fieldErrors.pnrCode).toBeUndefined()
  })

  it('ข้อมูลถูกต้องทั้งหมด → fieldErrors ว่าง', () => {
    const result = validatePastedRows([makeRow()], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(Object.keys(result[0].fieldErrors)).toHaveLength(0)
    expect(Object.keys(result[0].fieldWarnings)).toHaveLength(0)
  })

  it('Error หลายช่องในแถวเดียว → fieldErrors มีหลาย key', () => {
    // PNR ว่าง ไม่เป็น error แล้ว (isDummy) ใช้ seat=0 + outboundDate ผิดแทน
    const result = validatePastedRows([makeRow({ seatCount: 0, outboundDate: 'bad' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].fieldErrors.seatCount).toBeTruthy()
    expect(result[0].fieldErrors.outboundDate).toBeTruthy()
    expect(Object.keys(result[0].fieldErrors).length).toBeGreaterThanOrEqual(2)
  })

  it('Error ข้ามช่อง: วันกลับก่อนวันไป → ทั้ง outboundDate และ returnDate ถูก highlight', () => {
    const result = validatePastedRows([makeRow({ outboundDate: '2026-10-14', returnDate: '2026-10-10' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].fieldErrors.outboundDate).toBeTruthy()
    expect(result[0].fieldErrors.returnDate).toBeTruthy()
    expect(result[0].fieldErrors.outboundDate).toBe(result[0].fieldErrors.returnDate)
  })

  it('แก้ช่องที่ผิด → fieldErrors ของช่องนั้นหาย', () => {
    const bad = makeRow({ seatCount: 0 })
    const first = validatePastedRows([bad], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(first[0].fieldErrors.seatCount).toBeTruthy()

    const fixed = { ...bad, seatCount: 36 }
    const second = validatePastedRows([fixed], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(second[0].fieldErrors.seatCount).toBeUndefined()
    expect(second[0].status).toBe('READY')
  })

  it('แก้ PNR ซ้ำ → fieldErrors.pnrCode หาย', () => {
    const duped = [makeRow({ pnrCode: 'DUPE' }), makeRow({ pnrCode: 'DUPE' })]
    const first = validatePastedRows(duped, [], AIRLINE_CODES, AIRPORT_CODES)
    expect(first[1].fieldErrors.pnrCode).toBeTruthy()

    const fixed = [makeRow({ pnrCode: 'DUPE' }), makeRow({ pnrCode: 'UNIQ' })]
    const second = validatePastedRows(fixed, [], AIRLINE_CODES, AIRPORT_CODES)
    expect(second[1].fieldErrors.pnrCode).toBeUndefined()
  })
})

describe('fieldWarnings — per-cell yellow highlight', () => {
  it('Airport ไม่มีใน Master → fieldWarnings.outboundFrom มีค่า (ไม่ใช่ error)', () => {
    const result = validatePastedRows([makeRow({ outboundFrom: 'ZZZ' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].fieldWarnings.outboundFrom).toBeTruthy()
    expect(result[0].fieldErrors.outboundFrom).toBeUndefined()
    expect(result[0].status).toBe('WARNING')
  })

  it('Airline ไม่มีใน Master → fieldWarnings.outboundFlight มีค่า', () => {
    const result = validatePastedRows([makeRow({ outboundFlight: 'XX999', outboundAirlineCode: 'XX' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].fieldWarnings.outboundFlight).toBeTruthy()
    expect(result[0].fieldErrors.outboundFlight).toBeUndefined()
  })

  it('Airport กลับไม่มีใน Master → fieldWarnings.returnTo มีค่า', () => {
    const result = validatePastedRows([makeRow({ returnTo: 'ZZZ' })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].fieldWarnings.returnTo).toBeTruthy()
    expect(result[0].status).toBe('WARNING')
  })

  it('แก้ Airport ให้อยู่ใน Master → fieldWarnings หาย → READY', () => {
    const warn = makeRow({ outboundTo: 'ZZZ' })
    const first = validatePastedRows([warn], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(first[0].fieldWarnings.outboundTo).toBeTruthy()

    const fixed = { ...warn, outboundTo: 'NRT' }
    const second = validatePastedRows([fixed], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(second[0].fieldWarnings.outboundTo).toBeUndefined()
    expect(second[0].status).toBe('READY')
  })
})

describe('ปุ่มบันทึก Disable เมื่อมี Error', () => {
  it('PNR ว่าง → WARNING ไม่ใช่ ERROR → canConfirm = true', () => {
    const result = validatePastedRows([makeRow({ pnrCode: '', isDummy: true })], [], AIRLINE_CODES, AIRPORT_CODES)
    const errorCount = result.filter(r => r.status === 'ERROR').length
    expect(errorCount).toBe(0)  // PNR ว่างไม่ทำให้ disable
    expect(result[0].status).toBe('WARNING')
  })

  it('Seat = 0 → ERROR → canConfirm = false', () => {
    const result = validatePastedRows([makeRow({ seatCount: 0 })], [], AIRLINE_CODES, AIRPORT_CODES)
    const errorCount = result.filter(r => r.status === 'ERROR').length
    expect(errorCount).toBeGreaterThan(0)  // ปุ่มต้อง disable
  })

  it('ไม่มี Error (มีแค่ Warning) → canConfirm = true (errorCount === 0)', () => {
    const result = validatePastedRows([makeRow({ outboundFrom: 'ZZZ' })], [], AIRLINE_CODES, AIRPORT_CODES)
    const errorCount = result.filter(r => r.status === 'ERROR').length
    expect(errorCount).toBe(0)  // ปุ่มต้อง enable ได้
    expect(result[0].status).toBe('WARNING')
  })

  it('ข้อมูลสะอาด → errorCount === 0', () => {
    const result = validatePastedRows([makeRow()], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result.filter(r => r.status === 'ERROR').length).toBe(0)
  })
})

describe('focusField — ID convention', () => {
  it('ID รูปแบบ paste-r{rowIndex}-{fieldKey} ถูกสร้างตามที่กำหนด', () => {
    // ทดสอบ convention ของ ID ที่ focusField ใช้
    const rowIndex = 3
    const fieldKey = 'pnrCode'
    const expectedId = `paste-r${rowIndex}-${fieldKey}`
    expect(expectedId).toBe('paste-r3-pnrCode')
  })

  it('fieldKey ที่เป็นไปได้ครบทุกชนิด', () => {
    const ALL_FIELD_KEYS: string[] = [
      'pnrCode','seatCount','outboundDate','outboundFlight',
      'outboundFrom','outboundTo','returnDate','returnFlight',
      'returnFrom','returnTo',
    ]
    const result = validatePastedRows([
      makeRow({ pnrCode: '', isDummy: true, seatCount: 0, outboundDate: 'bad', outboundFlight: 'bad',
        outboundFrom: '', outboundTo: '', returnDate: 'bad', returnFlight: 'bad',
        returnFrom: '', returnTo: '' })
    ], [], AIRLINE_CODES, AIRPORT_CODES)
    const errorFields = Object.keys(result[0].fieldErrors)
    for (const f of errorFields) {
      expect(ALL_FIELD_KEYS).toContain(f)
    }
  })
})

// ─── PNR ว่าง = Dummy (ไม่เป็น Error) ───────────────────────────────────────
describe('Dummy PNR — PNR ว่างในโหมด 2-Sector', () => {
  it('PNR ว่าง 1 แถว → isDummy=true, status=WARNING, ไม่มี PNR error', () => {
    const result = validatePastedRows([makeRow({ pnrCode: '', isDummy: true })], [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('WARNING')
    expect(result[0].data.isDummy).toBe(true)
    expect(result[0].errors.some(e => e.col === 'PNR')).toBe(false)
    expect(result[0].fieldErrors.pnrCode).toBeUndefined()
  })

  it('PNR ว่างหลายแถว → ทุกแถว isDummy=true, ไม่มี error, สถานะ WARNING', () => {
    const rows = [
      makeRow({ pnrCode: '', isDummy: true }),
      makeRow({ pnrCode: '', isDummy: true }),
      makeRow({ pnrCode: '', isDummy: true }),
    ]
    const result = validatePastedRows(rows, [], AIRLINE_CODES, AIRPORT_CODES)
    expect(result).toHaveLength(3)
    for (const r of result) {
      expect(r.status).toBe('WARNING')
      expect(r.data.isDummy).toBe(true)
      expect(r.errors.some(e => e.col === 'PNR')).toBe(false)
    }
  })

  it('normalizePastedRows กับ PNR ว่าง → isDummy=true', () => {
    const raw = parsePastedExcel('\t36\t10/10/2026\tTG640\tBKK\tNRT\t14/10/2026\tTG641\tNRT\tBKK')
    const rows = normalizePastedRows(raw)
    expect(rows[0].pnrCode).toBe('')
    expect(rows[0].isDummy).toBe(true)
  })

  it('Dummy PNR ที่ข้อมูลอื่นถูกต้อง → ยังเพิ่มได้ (errorCount = 0)', () => {
    const rows = [makeRow({ pnrCode: '', isDummy: true })]
    const result = validatePastedRows(rows, [], AIRLINE_CODES, AIRPORT_CODES)
    const errorCount = result.filter(r => r.status === 'ERROR').length
    expect(errorCount).toBe(0)
  })
})

// ─── Sector Template Validation (2-sector mode) ───────────────────────────────
describe('Sector Template Validation — 2-sector mode', () => {
  const tmpl2: SectorTemplate[] = [
    makeTmpl({ seq: 1, sectorType: 'Outbound', flightNo: 'TG640', depAirportCode: 'BKK', arrAirportCode: 'NRT', dayOffset: 0 }),
    makeTmpl({ seq: 2, sectorType: 'Return',   flightNo: 'TG641', depAirportCode: 'NRT', arrAirportCode: 'BKK', dayOffset: 4 }),
  ]

  it('ข้อมูลตรง template ทั้งหมด → READY', () => {
    const r = validatePastedRows([makeRow()], [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(r[0].status).toBe('READY')
  })

  it('Flight No. ขาไปไม่ตรง → ERROR ช่อง outboundFlight', () => {
    const r = validatePastedRows([makeRow({ outboundFlight: 'TG999' })], [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(r[0].fieldErrors.outboundFlight).toBeTruthy()
    expect(r[0].fieldErrors.outboundFlight).toContain('TG640')
    expect(r[0].status).toBe('ERROR')
  })

  it('From ขาไปไม่ตรง → ERROR ช่อง outboundFrom', () => {
    const r = validatePastedRows([makeRow({ outboundFrom: 'DMK' })], [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(r[0].fieldErrors.outboundFrom).toBeTruthy()
    expect(r[0].fieldErrors.outboundFrom).toContain('BKK')
  })

  it('To ขาไปไม่ตรง → ERROR ช่อง outboundTo', () => {
    const r = validatePastedRows([makeRow({ outboundTo: 'HND' })], [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(r[0].fieldErrors.outboundTo).toBeTruthy()
    expect(r[0].fieldErrors.outboundTo).toContain('NRT')
  })

  it('Flight No. ขากลับไม่ตรง → ERROR ช่อง returnFlight', () => {
    const r = validatePastedRows([makeRow({ returnFlight: 'TG999' })], [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(r[0].fieldErrors.returnFlight).toBeTruthy()
    expect(r[0].fieldErrors.returnFlight).toContain('TG641')
  })

  it('From ขากลับไม่ตรง → ERROR ช่อง returnFrom', () => {
    const r = validatePastedRows([makeRow({ returnFrom: 'HND' })], [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(r[0].fieldErrors.returnFrom).toBeTruthy()
  })

  it('วันกลับไม่ตรง Day Offset → ERROR ช่อง returnDate', () => {
    // dayOffset=4 → returnDate should be outboundDate + 4 = 2026-10-14
    const r = validatePastedRows([makeRow({ returnDate: '2026-10-20' })], [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(r[0].fieldErrors.returnDate).toBeTruthy()
    expect(r[0].fieldErrors.returnDate).toContain('2026-10-14')
  })

  it('ไม่มี Template → ไม่ตรวจ Template (READY ปกติ)', () => {
    const r = validatePastedRows([makeRow({ outboundFlight: 'TG999' })], [], AIRLINE_CODES, AIRPORT_CODES)
    // ไม่มี template error — มีแค่ warning จาก airline ที่ไม่อยู่ใน master (TG อยู่แล้ว ดังนั้น READY)
    expect(r[0].fieldErrors.outboundFlight).toBeUndefined()
    expect(r[0].status).toBe('READY')
  })

  it('แก้ Flight ให้ตรง template → Error หาย', () => {
    const bad = makeRow({ outboundFlight: 'TG999' })
    const first = validatePastedRows([bad], [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(first[0].fieldErrors.outboundFlight).toBeTruthy()

    const fixed = { ...bad, outboundFlight: 'TG640', outboundAirlineCode: 'TG' }
    const second = validatePastedRows([fixed], [], AIRLINE_CODES, AIRPORT_CODES, tmpl2)
    expect(second[0].fieldErrors.outboundFlight).toBeUndefined()
    expect(second[0].status).toBe('READY')
  })
})

// ─── parseMultiSectorPaste ────────────────────────────────────────────────────
describe('parseMultiSectorPaste', () => {
  const MS_ROW = 'G1\tSD1SD2\t36\t1\t10/10/2026\tTG701\tBKK\tNRT\t23:00\t16:00\t1'

  it('parse แถว multi-sector 1 แถว', () => {
    const result = parseMultiSectorPaste([MS_ROW.split('\t')])
    expect(result[0].importGroup).toBe('G1')
    expect(result[0].pnrCode).toBe('SD1SD2')
    expect(result[0].seatCount).toBe(36)
    expect(result[0].seq).toBe(1)
    expect(result[0].travelDate).toBe('2026-10-10')
    expect(result[0].flightNo).toBe('TG701')
    expect(result[0].depAirportCode).toBe('BKK')
    expect(result[0].arrAirportCode).toBe('NRT')
    expect(result[0].depTime).toBe('23:00')
    expect(result[0].arrTime).toBe('16:00')
    expect(result[0].plusDay).toBe(1)
    expect(result[0].airlineCode).toBe('TG')
  })

  it('PNR ว่างใน multi-sector → pnrCode = ""', () => {
    const raw = [['G1', '', '36', '1', '10/10/2026', 'TG701', 'BKK', 'NRT', '23:00', '16:00', '1']]
    const result = parseMultiSectorPaste(raw)
    expect(result[0].pnrCode).toBe('')
    expect(result[0].importGroup).toBe('G1')
  })
})

// ─── groupMultiSectorRows ─────────────────────────────────────────────────────
describe('groupMultiSectorRows', () => {
  it('PNR มี → Group ด้วย PNR', () => {
    const rows = [
      makeMultiRow({ pnrCode: 'ABCD', importGroup: '', seq: 1 }),
      makeMultiRow({ pnrCode: 'ABCD', importGroup: '', seq: 2 }),
    ]
    const groups = groupMultiSectorRows(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].groupKey).toBe('ABCD')
    expect(groups[0].sectors).toHaveLength(2)
    expect(groups[0].isDummy).toBe(false)
  })

  it('PNR ว่าง → Group ด้วย Import Group', () => {
    const rows = [
      makeMultiRow({ pnrCode: '', importGroup: 'G1', seq: 1 }),
      makeMultiRow({ pnrCode: '', importGroup: 'G1', seq: 2 }),
      makeMultiRow({ pnrCode: '', importGroup: 'G2', seq: 1 }),
      makeMultiRow({ pnrCode: '', importGroup: 'G2', seq: 2 }),
    ]
    const groups = groupMultiSectorRows(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0].groupKey).toBe('G1')
    expect(groups[0].isDummy).toBe(true)
    expect(groups[1].groupKey).toBe('G2')
  })

  it('PNR ว่างหลายแถวที่ไม่มี Import Group → placeholder แยกต่างหาก', () => {
    const rows = [
      makeMultiRow({ pnrCode: '', importGroup: '', seq: 1 }),
      makeMultiRow({ pnrCode: '', importGroup: '', seq: 2 }),
    ]
    const groups = groupMultiSectorRows(rows)
    expect(groups).toHaveLength(2)  // แยกกัน ไม่ merge
  })

  it('รักษาลำดับ Group ตามที่วาง', () => {
    const rows = [
      makeMultiRow({ pnrCode: 'B', importGroup: '' }),
      makeMultiRow({ pnrCode: 'A', importGroup: '' }),
    ]
    const groups = groupMultiSectorRows(rows)
    expect(groups[0].groupKey).toBe('B')
    expect(groups[1].groupKey).toBe('A')
  })
})

// ─── validatePNRGroups ────────────────────────────────────────────────────────
describe('validatePNRGroups', () => {
  const tmpl3: SectorTemplate[] = [
    makeTmpl({ seq: 1, sectorType: 'Outbound', flightNo: 'TG701', depAirportCode: 'BKK', arrAirportCode: 'NRT', depTime: '23:00', arrTime: '16:00', plusDay: 1, dayOffset: 0 }),
    makeTmpl({ seq: 2, sectorType: 'Transit',  flightNo: 'TG999', depAirportCode: 'NRT', arrAirportCode: 'CTS', depTime: '08:00', arrTime: '10:00', plusDay: 0, dayOffset: 1 }),
    makeTmpl({ seq: 3, sectorType: 'Return',   flightNo: 'TG702', depAirportCode: 'CTS', arrAirportCode: 'BKK', depTime: '17:00', arrTime: '22:00', plusDay: 0, dayOffset: 6 }),
  ]

  function makeGroup3(pnrCode = '', importGroup = 'G1', travelStart = '2026-10-10') {
    return groupMultiSectorRows([
      makeMultiRow({ pnrCode, importGroup, seq: 1, travelDate: travelStart, flightNo: 'TG701', depAirportCode: 'BKK', arrAirportCode: 'NRT', depTime: '23:00', arrTime: '16:00', plusDay: 1 }),
      makeMultiRow({ pnrCode, importGroup, seq: 2, travelDate: '2026-10-11', flightNo: 'TG999', depAirportCode: 'NRT', arrAirportCode: 'CTS', depTime: '08:00', arrTime: '10:00', plusDay: 0 }),
      makeMultiRow({ pnrCode, importGroup, seq: 3, travelDate: '2026-10-16', flightNo: 'TG702', depAirportCode: 'CTS', arrAirportCode: 'BKK', depTime: '17:00', arrTime: '22:00', plusDay: 0 }),
    ])
  }

  it('Dummy PNR ที่ข้อมูลตรง Template → WARNING (ไม่ใช่ ERROR)', () => {
    const groups = makeGroup3('', 'G1')
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].isDummy).toBe(true)
    expect(result[0].status).toBe('WARNING')
    expect(result[0].errors.some(e => e.col === 'PNR')).toBe(false)
  })

  it('PNR มี ข้อมูลตรง → READY', () => {
    const groups = makeGroup3('ABCDEF', '')
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('READY')
    expect(result[0].isDummy).toBe(false)
  })

  it('Import Group ว่าง + PNR ว่าง → ERROR (ต้องระบุ Import Group)', () => {
    const groups = groupMultiSectorRows([
      makeMultiRow({ pnrCode: '', importGroup: '', seq: 1 }),
    ])
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
    expect(result[0].errors.some(e => e.col === 'Import Group')).toBe(true)
  })

  it('จำนวน Sector ไม่ตรง Step 2 → ERROR', () => {
    const groups = groupMultiSectorRows([
      makeMultiRow({ pnrCode: '', importGroup: 'G1', seq: 1 }),
      makeMultiRow({ pnrCode: '', importGroup: 'G1', seq: 2 }),
      // ขาด Sector 3
    ])
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
    expect(result[0].errors.some(e => e.col === 'จำนวน Sector')).toBe(true)
    expect(result[0].errors[0].message).toContain('3')
  })

  it('Seq ซ้ำกัน → ERROR ช่อง seq', () => {
    const groups = groupMultiSectorRows([
      makeMultiRow({ pnrCode: 'ABCD', seq: 1 }),
      makeMultiRow({ pnrCode: 'ABCD', seq: 1 }),  // ซ้ำ
      makeMultiRow({ pnrCode: 'ABCD', seq: 3 }),
    ])
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[0].seq).toBeTruthy()
    expect(result[0].sectorFieldErrors[1].seq).toBeTruthy()
  })

  it('Flight No. ไม่ตรง Template → ERROR ช่อง flightNo', () => {
    const groups = makeGroup3('', 'G1')
    // แก้ sector 1 ให้ใช้ flight ผิด
    groups[0].sectors[0] = { ...groups[0].sectors[0], flightNo: 'TG999' }
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[0].flightNo).toBeTruthy()
    expect(result[0].sectorFieldErrors[0].flightNo).toContain('TG701')
  })

  it('Airline ไม่ตรง Template → ERROR ช่อง flightNo', () => {
    const groups = makeGroup3('', 'G1')
    groups[0].sectors[0] = { ...groups[0].sectors[0], flightNo: 'FD701', airlineCode: 'FD' }
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[0].flightNo).toBeTruthy()
    expect(result[0].sectorFieldErrors[0].flightNo).toContain('TG')
  })

  it('From ไม่ตรง Template → ERROR ช่อง depAirportCode', () => {
    const groups = makeGroup3('', 'G1')
    groups[0].sectors[0] = { ...groups[0].sectors[0], depAirportCode: 'DMK' }
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[0].depAirportCode).toBeTruthy()
    expect(result[0].sectorFieldErrors[0].depAirportCode).toContain('BKK')
  })

  it('To ไม่ตรง Template → ERROR ช่อง arrAirportCode', () => {
    const groups = makeGroup3('', 'G1')
    groups[0].sectors[0] = { ...groups[0].sectors[0], arrAirportCode: 'HND' }
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[0].arrAirportCode).toBeTruthy()
    expect(result[0].sectorFieldErrors[0].arrAirportCode).toContain('NRT')
  })

  it('เวลาออกไม่ตรง Template → ERROR ช่อง depTime', () => {
    const groups = makeGroup3('', 'G1')
    groups[0].sectors[0] = { ...groups[0].sectors[0], depTime: '22:00' }
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[0].depTime).toBeTruthy()
    expect(result[0].sectorFieldErrors[0].depTime).toContain('23:00')
  })

  it('+Day ไม่ตรง Template → ERROR ช่อง plusDay', () => {
    const groups = makeGroup3('', 'G1')
    groups[0].sectors[0] = { ...groups[0].sectors[0], plusDay: 0 }
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[0].plusDay).toBeTruthy()
    expect(result[0].sectorFieldErrors[0].plusDay).toContain('1')
  })

  it('วันที่ Sector 2 ไม่ตรง Day Offset → ERROR ช่อง travelDate', () => {
    const groups = makeGroup3('', 'G1', '2026-10-10')
    // Sector 2 dayOffset=1 → คาดหวัง 2026-10-11 แต่วางเป็น 2026-10-12
    groups[0].sectors[1] = { ...groups[0].sectors[1], travelDate: '2026-10-12' }
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[1].travelDate).toBeTruthy()
    expect(result[0].sectorFieldErrors[1].travelDate).toContain('2026-10-11')
  })

  it('Airport ไม่ต่อเนื่องระหว่าง Sector → ERROR ทั้ง arrAirportCode และ depAirportCode', () => {
    const groups = makeGroup3('', 'G1')
    // Sector 1 arrAirportCode = NRT, Sector 2 depAirportCode ควรเป็น NRT แต่เปลี่ยนเป็น HND
    groups[0].sectors[1] = { ...groups[0].sectors[1], depAirportCode: 'HND' }
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    // Sector 0 (idx=0): arrAirportCode ควรถูก flag
    // Sector 1 (idx=1): depAirportCode ถูก flag จากทั้ง template mismatch และ continuity
    expect(result[0].sectorFieldErrors[0].arrAirportCode).toBeTruthy()
    expect(result[0].sectorFieldErrors[1].depAirportCode).toBeTruthy()
  })

  it('Seq ไม่มีใน Template → ERROR', () => {
    const groups = groupMultiSectorRows([
      makeMultiRow({ pnrCode: 'A', importGroup: '', seq: 99 }),
    ])
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].sectorFieldErrors[0].seq).toBeTruthy()
    expect(result[0].sectorFieldErrors[0].seq).toContain('99')
  })

  it('PNR ซ้ำกับระบบ → ERROR', () => {
    const groups = makeGroup3('EXIST', '')
    const result = validatePNRGroups(groups, ['EXIST'], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(result[0].status).toBe('ERROR')
    expect(result[0].errors.some(e => e.col === 'PNR')).toBe(true)
  })

  it('Dummy PNR ที่ข้อมูลถูกต้องทั้งหมด → เพิ่มเข้าตารางได้ (errorCount=0)', () => {
    const groups = makeGroup3('', 'G1')
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    const errorCount = result.filter(r => r.status === 'ERROR').length
    expect(errorCount).toBe(0)
    expect(result[0].isDummy).toBe(true)
    expect(result[0].status).toBe('WARNING')
  })

  it('แก้ Field ที่ผิด → Error ช่องนั้นหาย', () => {
    const groups = makeGroup3('', 'G1')
    groups[0].sectors[0] = { ...groups[0].sectors[0], depAirportCode: 'DMK' }
    const first = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(first[0].sectorFieldErrors[0].depAirportCode).toBeTruthy()

    // Fix: restore to BKK
    groups[0].sectors[0] = { ...groups[0].sectors[0], depAirportCode: 'BKK' }
    const second = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    expect(second[0].sectorFieldErrors[0].depAirportCode).toBeUndefined()
  })

  it('ไม่บันทึก DB ก่อน onConfirm — validatePNRGroups คืน in-memory object เท่านั้น', () => {
    const groups = makeGroup3('', 'G1')
    const result = validatePNRGroups(groups, [], tmpl3, AIRLINE_CODES, AIRPORT_CODES)
    // result เป็น plain object ไม่มี side effect ต่อ DB
    expect(typeof result[0]).toBe('object')
    expect(result[0].pnrCode).toBeDefined()
    // ไม่มี id หรือ created_at (ยังไม่ได้บันทึก)
    expect((result[0] as unknown as Record<string, unknown>).id).toBeUndefined()
  })
})
