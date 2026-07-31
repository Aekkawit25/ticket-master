// ─── Sector Type — single source of truth ─────────────────────────────────────
// มาตรฐาน Sector Type ของทั้งระบบ: Departure (ขาไป) / Transit (ต่อเครื่อง) / Return (ขากลับ)
//
// เดิมค่า "ขากลับ" เก็บเป็น 'Arrival' (และก่อนหน้านั้นอีกคือ 'Return' แบบ SQL-era/'Outbound'/'Domestic')
// ทำให้ชื่อที่แสดงผู้ใช้งานไม่ตรงกับคำที่ระบบต้องการใช้ ("Return") — ไฟล์นี้เป็นจุดเดียวที่นิยาม
// ค่ามาตรฐานและฟังก์ชันแปลงค่าเดิม ห้ามเขียนข้อความ/เงื่อนไข Sector Type แยกไว้ที่ Component อื่น

import type { SectorType } from '@/types'

export const SECTOR_TYPE = {
  DEPARTURE: 'Departure',
  TRANSIT: 'Transit',
  RETURN: 'Return',
} as const satisfies Record<string, SectorType>

export const SECTOR_TYPE_OPTIONS: { value: SectorType; label: string }[] = [
  { value: SECTOR_TYPE.DEPARTURE, label: 'Departure' },
  { value: SECTOR_TYPE.TRANSIT, label: 'Transit' },
  { value: SECTOR_TYPE.RETURN, label: 'Return' },
]

/** สีข้อความมาตรฐานต่อ Sector Type — ใช้ร่วมกันแทนการนิยามซ้ำในแต่ละ Component */
export const SECTOR_TYPE_COLOR: Record<SectorType, string> = {
  Departure: 'text-green-600',
  Transit: 'text-amber-600',
  Return: 'text-purple-600',
}

/**
 * แปลงค่า Sector Type เดิม (ทุก case, รวม legacy value จากระบบเก่า:
 * 'Arrival' → Return, 'Outbound' → Departure, 'Domestic' → Transit)
 * ให้เป็นค่ามาตรฐานปัจจุบันเสมอ — ใช้ทุกจุดที่อ่าน/เปรียบเทียบ/แสดงผล Sector Type
 * ไม่แก้ไขค่าที่เก็บไว้จริงในฐานข้อมูล/localStorage โดยตรง (การ Normalize เกิดที่ Presentation/Read-time เท่านั้น)
 */
export function normalizeSectorType(value: string | null | undefined): SectorType {
  const v = value?.trim().toLowerCase()
  if (v === 'arrival' || v === 'return') return SECTOR_TYPE.RETURN
  if (v === 'departure' || v === 'outbound') return SECTOR_TYPE.DEPARTURE
  if (v === 'transit' || v === 'domestic') return SECTOR_TYPE.TRANSIT
  return (value as SectorType) ?? SECTOR_TYPE.DEPARTURE
}
