// 검색어/필터 상태 <-> URL query 변환.
// 예: #/?search=카드&emotion=웃김,황당&situation=한턱/쏘기&nogif=1
//     #/?ids=309,310,311  (골라서 공유한 짤만 보기)
// 태그 라벨에는 '/'는 있어도 ','는 없으므로 ','를 다중값 구분자로 쓴다.

const SEP = ','

function first(value) {
  return Array.isArray(value) ? value[0] : value
}

function splitList(value, allowed) {
  const raw = first(value)
  if (!raw) return []
  const items = String(raw).split(SEP)
    .map(s => s.trim().normalize('NFC'))
    .filter(Boolean)
  const unique = [...new Set(items)]
  // taxonomy가 아직 없으면 거르지 않는다 (로딩 전 호출 대비)
  return allowed ? unique.filter(t => allowed.includes(t)) : unique
}

// 순서 유지(공유한 사람이 고른 순서대로 보여줌), 숫자 아닌 값/중복 제거
function parseIds(value) {
  const raw = first(value)
  if (!raw) return []
  const ids = String(raw).split(SEP).map(s => s.trim()).filter(s => /^\d+$/.test(s))
  return [...new Set(ids)]
}

export function parseFilterQuery(query = {}, taxonomy) {
  const search = first(query.search)
  const nogif = first(query.nogif)
  return {
    search: search ? String(search).normalize('NFC') : null,
    emotion: splitList(query.emotion, taxonomy && taxonomy.emotion.map(t => t.ko)),
    situation: splitList(query.situation, taxonomy && taxonomy.situation.map(t => t.ko)),
    // 파라미터가 없으면 null → 호출 측이 localStorage 값을 그대로 쓴다
    excludeGif: nogif === undefined || nogif === null ? null : nogif === '1',
    ids: parseIds(query.ids)
  }
}

export function buildFilterQuery({ search, emotion, situation, excludeGif, ids }) {
  const query = {}
  if (search) query.search = search
  if (emotion && emotion.length) query.emotion = emotion.join(SEP)
  if (situation && situation.length) query.situation = situation.join(SEP)
  if (excludeGif) query.nogif = '1'
  if (ids && ids.length) query.ids = ids.join(SEP)
  return query
}

// id는 전역 최대값+1로 채번되므로 큰 id = 최근 추가. 문자열 비교('9' > '311') 함정 주의.
export function recentIds(images, count) {
  return images
    .map(img => String(img.id))
    .sort((a, b) => Number(b) - Number(a))
    .slice(0, count)
}

export function orderByIds(images, ids) {
  const byId = new Map(images.map(img => [String(img.id), img]))
  return ids.map(id => byId.get(id)).filter(Boolean)
}
