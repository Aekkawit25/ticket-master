import { describe, it, expect } from 'vitest'
import { sameAirport } from './time-utils'

describe('sameAirport', () => {
  it('BKK → CTS: different airports — should return false', () => {
    expect(sameAirport('BKK', 'CTS')).toBe(false)
  })

  it('CTS → BKK: different airports — should return false', () => {
    expect(sameAirport('CTS', 'BKK')).toBe(false)
  })

  it('BKK → BKK: same airports — should return true', () => {
    expect(sameAirport('BKK', 'BKK')).toBe(true)
  })

  it('bkk → BKK: case-insensitive match — should return true', () => {
    expect(sameAirport('bkk', 'BKK')).toBe(true)
  })

  it('" BKK " → "BKK": whitespace is trimmed — should return true', () => {
    expect(sameAirport(' BKK ', 'BKK')).toBe(true)
  })

  it('empty a — should return false (not-yet-filled field)', () => {
    expect(sameAirport('', 'BKK')).toBe(false)
  })

  it('empty b — should return false (not-yet-filled field)', () => {
    expect(sameAirport('BKK', '')).toBe(false)
  })

  it('both empty — should return false', () => {
    expect(sameAirport('', '')).toBe(false)
  })

  it('DMK → DMK: same airports — should return true', () => {
    expect(sameAirport('DMK', 'DMK')).toBe(true)
  })

  it('NRT → NRT: same airports — should return true', () => {
    expect(sameAirport('NRT', 'NRT')).toBe(true)
  })
})
