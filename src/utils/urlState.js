// 검색어/필터 상태 <-> URL query 변환.
// 예: #/?search=카드&emotion=웃김,황당&situation=한턱/쏘기&nogif=1
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

export function parseFilterQuery(query = {}, taxonomy) {
  const search = first(query.search)
  const nogif = first(query.nogif)
  return {
    search: search ? String(search).normalize('NFC') : null,
    emotion: splitList(query.emotion, taxonomy && taxonomy.emotion.map(t => t.ko)),
    situation: splitList(query.situation, taxonomy && taxonomy.situation.map(t => t.ko)),
    // 파라미터가 없으면 null → 호출 측이 localStorage 값을 그대로 쓴다
    excludeGif: nogif === undefined || nogif === null ? null : nogif === '1'
  }
}

export function buildFilterQuery({ search, emotion, situation, excludeGif }) {
  const query = {}
  if (search) query.search = search
  if (emotion && emotion.length) query.emotion = emotion.join(SEP)
  if (situation && situation.length) query.situation = situation.join(SEP)
  if (excludeGif) query.nogif = '1'
  return query
}
