import { describe, it, expect } from 'vitest'
import { parseFilterQuery, buildFilterQuery } from './urlState'

const taxonomy = {
  emotion: [{ ko: '웃김' }, { ko: '놀람/충격' }],
  situation: [{ ko: '한턱/쏘기' }, { ko: '인사' }]
}

describe('parseFilterQuery', () => {
  it('returns empty state for empty query', () => {
    expect(parseFilterQuery({}, taxonomy)).toEqual({
      search: null, emotion: [], situation: [], excludeGif: null
    })
  })

  it('parses search, comma lists and nogif', () => {
    expect(parseFilterQuery({
      search: '카드', emotion: '웃김,놀람/충격', situation: '한턱/쏘기', nogif: '1'
    }, taxonomy)).toEqual({
      search: '카드', emotion: ['웃김', '놀람/충격'], situation: ['한턱/쏘기'], excludeGif: true
    })
  })

  it('drops tags not in taxonomy and duplicates', () => {
    expect(parseFilterQuery({ emotion: '웃김,없는태그,웃김' }, taxonomy).emotion).toEqual(['웃김'])
  })

  it('NFC-normalizes decomposed Korean (macOS NFD input)', () => {
    const nfd = '웃김'.normalize('NFD')
    expect(parseFilterQuery({ emotion: nfd, search: '카드'.normalize('NFD') }, taxonomy))
      .toMatchObject({ emotion: ['웃김'], search: '카드' })
  })

  it('treats nogif=0 as explicit false', () => {
    expect(parseFilterQuery({ nogif: '0' }, taxonomy).excludeGif).toBe(false)
  })

  it('uses first value when a param is repeated', () => {
    expect(parseFilterQuery({ search: ['a', 'b'] }, taxonomy).search).toBe('a')
  })
})

describe('buildFilterQuery', () => {
  it('omits empty values', () => {
    expect(buildFilterQuery({ search: '', emotion: [], situation: [], excludeGif: false })).toEqual({})
  })

  it('round-trips through parseFilterQuery', () => {
    const state = { search: '카드', emotion: ['놀람/충격'], situation: ['한턱/쏘기', '인사'], excludeGif: true }
    expect(parseFilterQuery(buildFilterQuery(state), taxonomy)).toEqual(state)
  })
})
