// 짤 데이터(sources/*.json, taxonomy.json) 읽기·쓰기 — 로컬 관리 화면 전용.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(PUBLIC_DIR, 'assets/data');
const SOURCES_DIR = path.join(DATA_DIR, 'sources');
const TAXONOMY_PATH = path.join(DATA_DIR, 'taxonomy.json');
const SOURCE_TYPES = ['gif', 'jpg', 'png', 'webp'];

const nfc = (s) => String(s ?? '').normalize('NFC');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
// 기존 파일과 같은 형식(4칸 들여쓰기)으로 저장해서 git diff 를 작게 유지한다.
const writeJson = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 4), 'utf8');

function readTaxonomy() {
  return readJson(TAXONOMY_PATH);
}

function listImages() {
  const all = [];
  for (const type of SOURCE_TYPES) {
    const p = path.join(SOURCES_DIR, `${type}.json`);
    if (!fs.existsSync(p)) continue;
    for (const rec of readJson(p)) all.push({ ...rec, type });
  }
  return all;
}

function findImage(id) {
  return listImages().find(r => String(r.id) === String(id)) || null;
}

// 쉼표로 나뉜 태그를 정리한다: 앞뒤 공백 제거, 빈 값·중복 제거(대소문자 무시).
function cleanTag(tag) {
  const seen = new Set();
  const out = [];
  for (const raw of nfc(tag).split(',')) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.join(', ');
}

// 감정·상황 값이 taxonomy 에 있는지 확인하고 정리한 필드를 돌려준다. 문제가 있으면 throw.
function validateFields({ name, emotion, situation, tag }, taxonomy = readTaxonomy()) {
  const errors = [];
  const cleanName = nfc(name).trim();
  if (!cleanName) errors.push('이름이 비어 있어');
  const check = (axis, values) => {
    const allowed = new Set(taxonomy[axis].map(t => t.ko));
    const list = [...new Set((values || []).map(v => nfc(v).trim()).filter(Boolean))];
    if (list.length === 0) errors.push(`${axis === 'emotion' ? '감정' : '상황'}을 1개 이상 골라줘`);
    const bad = list.filter(v => !allowed.has(v));
    if (bad.length) errors.push(`taxonomy 에 없는 값: ${bad.join(', ')}`);
    return list;
  };
  const cleanEmotion = check('emotion', emotion);
  const cleanSituation = check('situation', situation);
  if (errors.length) {
    const err = new Error(errors.join(' / '));
    err.status = 400;
    throw err;
  }
  return { name: cleanName, emotion: cleanEmotion, situation: cleanSituation, tag: cleanTag(tag) };
}

function updateImage(id, fields) {
  const clean = validateFields(fields);
  for (const type of SOURCE_TYPES) {
    const p = path.join(SOURCES_DIR, `${type}.json`);
    if (!fs.existsSync(p)) continue;
    const data = readJson(p);
    const idx = data.findIndex(r => String(r.id) === String(id));
    if (idx === -1) continue;
    // 키 순서를 유지한 채 편집 가능한 필드만 바꾼다(레거시 category_* 같은 필드는 그대로 둔다).
    data[idx] = { ...data[idx], ...clean };
    writeJson(p, data);
    regenerateData();
    return { ...data[idx], type };
  }
  const err = new Error(`id ${id} 짤이 없어`);
  err.status = 404;
  throw err;
}

function addTaxonomyItem(axis, ko, en = []) {
  if (!['emotion', 'situation'].includes(axis)) {
    const err = new Error('axis 는 emotion 또는 situation 이어야 해');
    err.status = 400;
    throw err;
  }
  const label = nfc(ko).trim();
  if (!label) {
    const err = new Error('한글 라벨이 비어 있어');
    err.status = 400;
    throw err;
  }
  const taxonomy = readTaxonomy();
  if (taxonomy[axis].some(t => t.ko === label)) return taxonomy;
  taxonomy[axis].push({ ko: label, en: en.map(e => nfc(e).trim()).filter(Boolean) });
  writeJson(TAXONOMY_PATH, taxonomy);
  return taxonomy;
}

// 프론트엔드가 읽는 data.json 을 sources 로부터 다시 만든다.
function regenerateData() {
  execFileSync(process.execPath, [path.join(DATA_DIR, 'generate-data.js')], { cwd: ROOT, stdio: 'pipe' });
}

// 중복 업로드 감지용: 원본 파일 md5 → 레코드. 파일 수가 수백 개라 한 번 계산해 캐시한다.
let md5Cache = null;
function md5File(p) {
  return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
}
// 캐시는 git 되돌리기·직접 편집으로 낡을 수 있어서, 조회할 때 레코드와 파일이 아직 있는지 다시 확인한다.
function findByMd5(hash) {
  const hit = md5Index().get(hash);
  if (!hit) return null;
  const rec = findImage(hit.id);
  if (rec && rec.file === hit.file && fs.existsSync(path.join(PUBLIC_DIR, rec.file))) return { id: rec.id, name: rec.name, file: rec.file };
  md5Cache = null; // 낡은 캐시 → 다시 만들어서 한 번 더 찾는다
  return md5Index().get(hash) || null;
}
function md5Index() {
  if (!md5Cache) {
    md5Cache = new Map();
    for (const rec of listImages()) {
      // webp 전환(2026-11-21) 후 file 은 변환본이라, 업로드 원본과 비교하려면 레코드에 저장한 원본 md5 를 쓴다
      if (rec.md5) { md5Cache.set(rec.md5, { id: rec.id, name: rec.name, file: rec.file }); continue; }
      const p = path.join(PUBLIC_DIR, rec.file);
      if (fs.existsSync(p)) md5Cache.set(md5File(p), { id: rec.id, name: rec.name, file: rec.file });
    }
  }
  return md5Cache;
}
function rememberMd5(hash, rec) {
  if (md5Cache) md5Cache.set(hash, { id: rec.id, name: rec.name, file: rec.file });
}

// 커밋 전 점검: 파일 존재, id 중복, taxonomy 밖 값.
function validateAll() {
  const taxonomy = readTaxonomy();
  const emotions = new Set(taxonomy.emotion.map(t => t.ko));
  const situations = new Set(taxonomy.situation.map(t => t.ko));
  const problems = [];
  const ids = new Map();
  for (const rec of listImages()) {
    if (!fs.existsSync(path.join(PUBLIC_DIR, rec.file))) problems.push(`id ${rec.id}: 원본 파일 없음 (${rec.file})`);
    if (rec.thumb && !fs.existsSync(path.join(PUBLIC_DIR, rec.thumb))) problems.push(`id ${rec.id}: 썸네일 없음 (${rec.thumb})`);
    if (/[^\x20-\x7e]/.test(rec.file)) problems.push(`id ${rec.id}: 파일 경로에 한글/특수문자 (${rec.file})`);
    ids.set(rec.id, (ids.get(rec.id) || 0) + 1);
    for (const e of rec.emotion || []) if (!emotions.has(e)) problems.push(`id ${rec.id}: taxonomy 에 없는 감정 "${e}"`);
    for (const s of rec.situation || []) if (!situations.has(s)) problems.push(`id ${rec.id}: taxonomy 에 없는 상황 "${s}"`);
  }
  for (const [id, n] of ids) if (n > 1) problems.push(`id ${id} 가 ${n}번 중복`);
  return problems;
}

module.exports = {
  ROOT, PUBLIC_DIR, DATA_DIR, SOURCES_DIR, SOURCE_TYPES,
  nfc, readJson, writeJson, readTaxonomy, listImages, findImage, cleanTag,
  validateFields, updateImage, addTaxonomyItem, regenerateData,
  md5File, md5Index, findByMd5, rememberMd5, validateAll,
};
