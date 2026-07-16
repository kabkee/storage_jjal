import { describe, it, expect } from 'vitest'
import { matchesSearch, matchesFacetFilters } from './imageFilter'

describe('matchesSearch', () => {
  const image = {
    name: '어휴',
    tag: 'Cat, 고양이, Driving, 운전',
    file: '/assets/gif/x.gif',
    emotion: ['웃김'],
    situation: ['인사']
  }

  it('matches empty query', () => {
    expect(matchesSearch(image, '')).toBe(true)
    expect(matchesSearch(image, null)).toBe(true)
  })

  it('matches name substring', () => {
    expect(matchesSearch(image, '어휴')).toBe(true)
  })

  it('matches tag substring case-insensitively', () => {
    expect(matchesSearch(image, 'driving')).toBe(true)
  })

  it('matches emotion array entries', () => {
    expect(matchesSearch(image, '웃김')).toBe(true)
  })

  it('matches situation array entries', () => {
    expect(matchesSearch(image, '인사')).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(matchesSearch(image, '없는단어')).toBe(false)
  })
})

describe('matchesFacetFilters', () => {
  const image = { emotion: ['웃김', '황당'], situation: ['거절/부정'] }

  it('matches everything when no filters are selected', () => {
    expect(matchesFacetFilters(image, { emotion: [], situation: [] })).toBe(true)
    expect(matchesFacetFilters(image, {})).toBe(true)
    expect(matchesFacetFilters(image, undefined)).toBe(true)
  })

  it('OR logic within a single facet', () => {
    expect(matchesFacetFilters(image, { emotion: ['분노', '웃김'] })).toBe(true)
  })

  it('AND logic across facets', () => {
    expect(matchesFacetFilters(image, { emotion: ['웃김'], situation: ['거절/부정'] })).toBe(true)
    expect(matchesFacetFilters(image, { emotion: ['웃김'], situation: ['인사'] })).toBe(false)
  })

  it('legacy images without emotion/situation never match an active filter, but still show under "all"', () => {
    const legacy = { category_1: 'GIF' }
    expect(matchesFacetFilters(legacy, { emotion: ['웃김'] })).toBe(false)
    expect(matchesFacetFilters(legacy, {})).toBe(true)
  })
})
