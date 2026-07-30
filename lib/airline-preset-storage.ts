/**
 * Airline Preset Storage
 * ─────────────────────────────────────────────────────────────────────────────
 * เก็บ "preset เงื่อนไขต่อสายการบิน" ใน localStorage เพื่อให้แก้ไข/เพิ่ม/ลบ
 * ได้ตอน runtime โดยไม่ต้องแก้โค้ดและ deploy ใหม่
 *
 * ความสัมพันธ์กับ lib/airline-condition-presets.ts:
 *   - ไฟล์นั้น = ค่าตั้งต้น (built-in defaults) + builder ล้วน (pure, no DOM)
 *   - ไฟล์นี้ = persistence layer (client-only) ที่ seed จาก defaults
 *
 * ใช้ pattern เดียวกับ lib/template-storage.ts (localStorage + custom event)
 */

import {
  AIRLINE_CONDITION_PRESETS as DEFAULT_AIRLINE_CONDITION_PRESETS,
  applyAirlinePreset,
  type AirlineConditionPreset,
  type AppliedPreset,
} from '@/lib/airline-condition-presets'

const PRESET_STORAGE_KEY = 'ticket_stock_airline_condition_presets'
export const AIRLINE_PRESET_UPDATED_EVENT = 'airline_preset_updated'

// ─── Internal helpers ─────────────────────────────────────────────────────────

function defaultsAsArray(): AirlineConditionPreset[] {
  return Object.values(DEFAULT_AIRLINE_CONDITION_PRESETS)
}

function readRaw(): AirlineConditionPreset[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AirlineConditionPreset[]
    return Array.isArray(parsed) ? parsed.map(normalizePreset) : null
  } catch {
    return null
  }
}

function writeRaw(presets: AirlineConditionPreset[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets))
    window.dispatchEvent(new CustomEvent(AIRLINE_PRESET_UPDATED_EVENT))
  } catch {
    // silently ignore quota errors
  }
}

/** เติม field ที่อาจหายไปจากข้อมูลเก่า เพื่อกัน runtime error */
function normalizePreset(p: Partial<AirlineConditionPreset>): AirlineConditionPreset {
  return {
    airlineCode: (p.airlineCode ?? '').toUpperCase(),
    airlineName: p.airlineName ?? p.airlineCode ?? '',
    defaultTicketType: p.defaultTicketType ?? 'Group',
    currency: p.currency ?? 'THB',
    suggestedTemplateName: p.suggestedTemplateName ?? '',
    description: p.description ?? '',
    stageSeeds: Array.isArray(p.stageSeeds) ? p.stageSeeds : [],
    ruleSeeds: Array.isArray(p.ruleSeeds) ? p.ruleSeeds : [],
    internalNote: p.internalNote ?? '',
  }
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

/** เขียน defaults ลง storage ถ้ายังไม่เคยมีข้อมูล */
export function seedAirlinePresetsIfEmpty(): void {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(PRESET_STORAGE_KEY)) return
  writeRaw(defaultsAsArray())
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * คืน preset ทั้งหมด — รวม built-in defaults กับ preset ที่ผู้ใช้แก้/เพิ่ม
 * preset ใน storage จะทับ default ที่ code เดียวกัน, default ที่ไม่ถูกแทนยังคงอยู่
 */
export function getAirlinePresets(): AirlineConditionPreset[] {
  const stored = readRaw()
  if (!stored) return defaultsAsArray()

  const byCode = new Map<string, AirlineConditionPreset>()
  // เริ่มจาก default ก่อน เพื่อให้ default ใหม่ที่เพิ่มใน code โผล่มาด้วย
  for (const d of defaultsAsArray()) byCode.set(d.airlineCode, d)
  // แล้วทับด้วยของที่อยู่ใน storage (รวมที่ผู้ใช้แก้และที่เพิ่มใหม่)
  for (const s of stored) byCode.set(s.airlineCode, s)

  return [...byCode.values()].sort((a, b) => a.airlineCode.localeCompare(b.airlineCode))
}

/** คืน preset ของสายการบิน (case-insensitive) จาก storage→default หรือ null */
export function getAirlinePreset(airlineCode: string | null | undefined): AirlineConditionPreset | null {
  if (!airlineCode) return null
  const code = airlineCode.toUpperCase()
  return getAirlinePresets().find(p => p.airlineCode === code) ?? null
}

/** มี preset สำหรับสายการบินนี้หรือไม่ (รวมที่ผู้ใช้เพิ่มเอง) */
export function hasAirlinePreset(airlineCode: string | null | undefined): boolean {
  return getAirlinePreset(airlineCode) !== null
}

/** รายชื่อรหัสสายการบินที่มี preset (เรียง A–Z) */
export function listAirlinePresetCodes(): string[] {
  return getAirlinePresets().map(p => p.airlineCode)
}

/** code นี้มีอยู่แล้วหรือไม่ (กันสร้างซ้ำ) */
export function isAirlinePresetCodeTaken(airlineCode: string): boolean {
  return hasAirlinePreset(airlineCode)
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * เพิ่ม/แก้ preset (upsert ตาม airlineCode)
 * เขียนทับเฉพาะรายการที่ code ตรงกัน ที่เหลือคงไว้
 */
export function saveAirlinePreset(preset: AirlineConditionPreset): void {
  const normalized = normalizePreset(preset)
  if (!normalized.airlineCode) return
  const current = getAirlinePresets().filter(p => p.airlineCode !== normalized.airlineCode)
  writeRaw([...current, normalized])
}

/**
 * ลบ preset ของสายการบิน
 * - ถ้าเป็นสายที่ override default ไว้ → กลับไปใช้ default
 * - ถ้าเป็นสายที่ผู้ใช้เพิ่มเอง → หายไปจริง
 */
export function deleteAirlinePreset(airlineCode: string): void {
  const code = airlineCode.toUpperCase()
  const remaining = getAirlinePresets().filter(p => p.airlineCode !== code)
  // เก็บเฉพาะรายการที่ "ไม่ตรงกับ default เป๊ะ" ก็พอ แต่เพื่อความเรียบง่าย
  // เขียนทั้งชุดที่เหลือลง storage แล้วปล่อยให้ default โผล่กลับมาเองตอน read
  const defaults = new Set(Object.keys(DEFAULT_AIRLINE_CONDITION_PRESETS))
  const toPersist = remaining.filter(p => !defaults.has(p.airlineCode) || isOverriddenFromDefault(p))
  writeRaw(toPersist)
}

/** true ถ้า preset ต่างจาก default ของ code เดียวกัน (เคยถูกแก้) */
function isOverriddenFromDefault(p: AirlineConditionPreset): boolean {
  const def = DEFAULT_AIRLINE_CONDITION_PRESETS[p.airlineCode]
  if (!def) return true
  return JSON.stringify(p) !== JSON.stringify(def)
}

/** รีเซ็ตทั้งหมดกลับเป็นค่าตั้งต้น */
export function resetAirlinePresetsToDefaults(): void {
  writeRaw(defaultsAsArray())
}

// ─── Apply ────────────────────────────────────────────────────────────────────

/**
 * resolve preset (storage→default) แล้ว build เป็นชุดข้อมูลพร้อม id จริง
 * สำหรับนำไปเติมลงใน Condition Template form — คืน null ถ้าไม่มี preset
 */
export function applyStoredAirlinePreset(airlineCode: string | null | undefined): AppliedPreset | null {
  const preset = getAirlinePreset(airlineCode)
  if (!preset) return null
  return applyAirlinePreset(preset)
}
