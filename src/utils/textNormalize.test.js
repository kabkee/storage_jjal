import { describe, it, expect } from 'vitest'
import { normalizeKorean, includesNormalized } from './textNormalize'

describe('normalizeKorean', () => {
  it('normalizes NFD(자모 분리형) Korean to NFC so visually identical strings compare equal', () => {
    const nfc = '자소서'
    const nfd = '자소서'.normalize('NFD')
    expect(nfc).not.toBe(nfd)
    expect(normalizeKorean(nfc)).toBe(normalizeKorean(nfd))
  })

  it('lowercases for case-insensitive comparison', () => {
    expect(normalizeKorean('Funny')).toBe('funny')
  })

  it('returns empty string for falsy input', () => {
    expect(normalizeKorean(null)).toBe('')
    expect(normalizeKorean(undefined)).toBe('')
  })
})

describe('includesNormalized', () => {
  it('matches when NFD-stored text is searched with an NFC query (the real bug found in data.json)', () => {
    const stored = '자소서거짓말'.normalize('NFD')
    expect(includesNormalized(stored, '자소서')).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(includesNormalized('Funny Cat', 'funny')).toBe(true)
  })

  it('returns false when either side is empty', () => {
    expect(includesNormalized('', 'x')).toBe(false)
    expect(includesNormalized('x', '')).toBe(false)
  })
})
