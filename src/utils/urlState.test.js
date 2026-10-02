import { describe, it, expect } from 'vitest'
import { parseFilterQuery, buildFilterQuery, recentIds, orderByIds } from './urlState'

const taxonomy = {
  emotion: [{ ko: '웃김' }, { ko: '놀람/충격' }],
  situation: [{ ko: '한턱/쏘기' }, { ko: '인사' }]
}

describe('parseFilterQuery', () => {
  it('returns empty state for empty query', () => {
    expect(parseFilterQuery({}, taxonomy)).toEqual({
      search: null, emotion: [], situation: [], excludeGif: null, ids: []
    })
  })

  it('parses search, comma lists and nogif', () => {
    expect(parseFilterQuery({
      search: '카드', emotion: '웃김,놀람/충격', situation: '한턱/쏘기', nogif: '1'
    }, taxonomy)).toEqual({
      search: '카드', emotion: ['웃김', '놀람/충격'], situation: ['한턱/쏘기'], excludeGif: true, ids: []
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
    const state = { search: '카드', emotion: ['놀람/충격'], situation: ['한턱/쏘기', '인사'], excludeGif: true, ids: ['311', '9'] }
    expect(parseFilterQuery(buildFilterQuery(state), taxonomy)).toEqual(state)
  })
})

describe('ids', () => {
  it('parses ids keeping order, dropping junk and duplicates', () => {
    expect(parseFilterQuery({ ids: '311, 9,abc,,311,-1' }, taxonomy).ids).toEqual(['311', '9'])
  })

  it('builds ids param only when non-empty', () => {
    expect(buildFilterQuery({ ids: [] })).toEqual({})
    expect(buildFilterQuery({ ids: ['309', '310'] })).toEqual({ ids: '309,310' })
  })
})

describe('recentIds', () => {
  const images = [{ id: '9' }, { id: '311' }, { id: '100' }, { id: '310' }]

  it('picks the N largest ids numerically (not as strings)', () => {
    expect(recentIds(images, 2)).toEqual(['311', '310'])
    expect(recentIds(images, 10)).toEqual(['311', '310', '100', '9'])
  })

  it('prefers added date over id (renumbered old images have big ids but no date)', () => {
    const mixed = [
      { id: '329' }, { id: '312' },
      { id: '309', added: '2026-10-02' }, { id: '311', added: '2026-10-02' }, { id: '200', added: '2026-09-01' }
    ]
    expect(recentIds(mixed, 3)).toEqual(['311', '309', '200'])
  })
})

describe('orderByIds', () => {
  it('returns images in the order of ids, skipping unknown ids', () => {
    const images = [{ id: '1' }, { id: '2' }, { id: '3' }]
    expect(orderByIds(images, ['3', '99', '1']).map(i => i.id)).toEqual(['3', '1'])
  })
})
