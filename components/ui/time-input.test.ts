import { describe, it, expect } from 'vitest'
import { normalizeTime, validateTime, isValidHHmm } from './time-input'

// ─── normalizeTime ────────────────────────────────────────────────────────────

describe('normalizeTime', () => {
  // Single digit hour
  it('"8" → "08:00"', () => expect(normalizeTime('8')).toBe('08:00'))
  it('"0" → "00:00"', () => expect(normalizeTime('0')).toBe('00:00'))
  it('"23" → "23:00"', () => expect(normalizeTime('23')).toBe('23:00'))

  // Two digit hour
  it('"08" → "08:00"', () => expect(normalizeTime('08')).toBe('08:00'))
  it('"00" → "00:00"', () => expect(normalizeTime('00')).toBe('00:00'))

  // Three digit (Hmm)
  it('"830" → "08:30"', () => expect(normalizeTime('830')).toBe('08:30'))
  it('"900" → "09:00"', () => expect(normalizeTime('900')).toBe('09:00'))

  // Four digits (HHmm)
  it('"0830" → "08:30"', () => expect(normalizeTime('0830')).toBe('08:30'))
  it('"1730" → "17:30"', () => expect(normalizeTime('1730')).toBe('17:30'))
  it('"0000" → "00:00"', () => expect(normalizeTime('0000')).toBe('00:00'))
  it('"2359" → "23:59"', () => expect(normalizeTime('2359')).toBe('23:59'))

  // Colon separator
  it('"8:30" → "08:30"', () => expect(normalizeTime('8:30')).toBe('08:30'))
  it('"08:30" → "08:30"', () => expect(normalizeTime('08:30')).toBe('08:30'))
  it('"0:00" → "00:00"', () => expect(normalizeTime('0:00')).toBe('00:00'))
  it('"23:59" → "23:59"', () => expect(normalizeTime('23:59')).toBe('23:59'))

  // Dot separator
  it('"8.30" → "08:30"', () => expect(normalizeTime('8.30')).toBe('08:30'))
  it('"08.30" → "08:30"', () => expect(normalizeTime('08.30')).toBe('08:30'))
  it('"17.30" → "17:30"', () => expect(normalizeTime('17.30')).toBe('17:30'))
  it('"00.00" → "00:00"', () => expect(normalizeTime('00.00')).toBe('00:00'))
  it('"17.45" → "17:45"', () => expect(normalizeTime('17.45')).toBe('17:45'))

  // Invalid hours (ชั่วโมงเกิน 23 ต้องไม่แปลง)
  it('"2544" → "" (ชั่วโมง 25 ไม่ถูกต้อง)', () => expect(normalizeTime('2544')).toBe(''))
  it('"2400" → "" (ชั่วโมง 24 ไม่ถูกต้อง)', () => expect(normalizeTime('2400')).toBe(''))

  // Already normalized
  it('"08:00" → "08:00"', () => expect(normalizeTime('08:00')).toBe('08:00'))
  it('"00:00" → "00:00"', () => expect(normalizeTime('00:00')).toBe('00:00'))

  // Out of range
  it('"24" → ""', () => expect(normalizeTime('24')).toBe(''))
  it('"24:00" → ""', () => expect(normalizeTime('24:00')).toBe(''))
  it('"12:60" → ""', () => expect(normalizeTime('12:60')).toBe(''))
  it('"2400" → ""', () => expect(normalizeTime('2400')).toBe(''))

  // Empty / whitespace
  it('"" → ""', () => expect(normalizeTime('')).toBe(''))
  it('"  " → ""', () => expect(normalizeTime('  ')).toBe(''))

  // Trimming
  it('"  08:30  " → "08:30"', () => expect(normalizeTime('  08:30  ')).toBe('08:30'))

  // Additional spec cases
  it('"0.00" → "00:00" (dot with leading zero)', () => expect(normalizeTime('0.00')).toBe('00:00'))
  it('"159:366" → "" (hour > 2 digits with colon)', () => expect(normalizeTime('159:366')).toBe(''))
  it('"25:00" → "" (hour > 23)', () => expect(normalizeTime('25:00')).toBe(''))
  it('"08:999" → "" (minute > 2 digits)', () => expect(normalizeTime('08:999')).toBe(''))
  it('"8:3:0" → "" (multiple separators)', () => expect(normalizeTime('8:3:0')).toBe(''))
  it('"08..30" → "" (double dot)', () => expect(normalizeTime('08..30')).toBe(''))
  it('"08::30" → "" (double colon)', () => expect(normalizeTime('08::30')).toBe(''))
  it('"159366" → "" (6 digits)', () => expect(normalizeTime('159366')).toBe(''))
  it('"12345" → "" (5 digits)', () => expect(normalizeTime('12345')).toBe(''))
  it('"8 PM" → "" (AM/PM rejected)', () => expect(normalizeTime('8 PM')).toBe(''))
  it('"8:30 PM" → "" (AM/PM rejected)', () => expect(normalizeTime('8:30 PM')).toBe(''))
  it('"17:30 AM" → "" (AM/PM rejected)', () => expect(normalizeTime('17:30 AM')).toBe(''))
})

// ─── validateTime ─────────────────────────────────────────────────────────────

describe('validateTime', () => {
  it('"00:00" ผ่าน', () => expect(validateTime('00:00')).toBe(true))
  it('"08:30" ผ่าน', () => expect(validateTime('08:30')).toBe(true))
  it('"23:59" ผ่าน', () => expect(validateTime('23:59')).toBe(true))
  it('"17:00" ผ่าน', () => expect(validateTime('17:00')).toBe(true))

  it('"24:00" ไม่ผ่าน', () => expect(validateTime('24:00')).toBe(false))
  it('"12:60" ไม่ผ่าน', () => expect(validateTime('12:60')).toBe(false))
  it('"" ไม่ผ่าน', () => expect(validateTime('')).toBe(false))
  it('"8:30" ไม่ผ่าน (ต้อง 2 หลัก)', () => expect(validateTime('8:30')).toBe(false))
  it('"abc" ไม่ผ่าน', () => expect(validateTime('abc')).toBe(false))
  it('"159:366" → false', () => expect(validateTime('159:366')).toBe(false))
  it('"23:60" → false', () => expect(validateTime('23:60')).toBe(false))
})

// ─── isValidHHmm ─────────────────────────────────────────────────────────────

describe('isValidHHmm', () => {
  it('"00:00" valid', () => expect(isValidHHmm('00:00')).toBe(true))
  it('"23:59" valid', () => expect(isValidHHmm('23:59')).toBe(true))
  it('"24:00" invalid', () => expect(isValidHHmm('24:00')).toBe(false))
  it('"12:60" invalid', () => expect(isValidHHmm('12:60')).toBe(false))
})

// ─── normalizeTime → validateTime pipeline ────────────────────────────────────

describe('normalizeTime → validateTime', () => {
  const cases: [string, boolean][] = [
    ['8',     true],
    ['08',    true],
    ['830',   true],
    ['0830',  true],
    ['1730',  true],
    ['8:30',  true],
    ['8.30',  true],
    ['0000',  true],
    ['2359',  true],
    ['24:00', false],
    ['12:60', false],
    ['',      false],
    ['abc',   false],
  ]

  cases.forEach(([input, expected]) => {
    it(`normalizeTime("${input}") then validateTime → ${expected}`, () => {
      const normalized = normalizeTime(input)
      const result = normalized !== '' && validateTime(normalized)
      expect(result).toBe(expected)
    })
  })
})

// ─── normalizeTime — spec invalid cases ──────────────────────────────────────

describe('normalizeTime — spec invalid cases', () => {
  const invalid = [
    '24:00', '23:60', '159:366', '159366', '08:999', '8:3:0',
    '08..30', '08::30', '9999', 'abc', '8 PM', '12345',
  ]
  invalid.forEach(input => {
    it(`"${input}" → ""`, () => expect(normalizeTime(input)).toBe(''))
  })
})

// ─── normalizeTime — spec valid cases ────────────────────────────────────────

describe('normalizeTime — spec valid cases', () => {
  const cases: [string, string][] = [
    ['00:00', '00:00'],
    ['00.00', '00:00'],
    ['0.00',  '00:00'],
    ['8',     '08:00'],
    ['08',    '08:00'],
    ['830',   '08:30'],
    ['0830',  '08:30'],
    ['8:30',  '08:30'],
    ['08:30', '08:30'],
    ['23:59', '23:59'],
  ]
  cases.forEach(([input, expected]) => {
    it(`"${input}" → "${expected}"`, () => expect(normalizeTime(input)).toBe(expected))
  })
})
