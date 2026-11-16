// 새로 올린 짤을 등록 전까지 보관하는 대기열. 저장 위치: <repo>/.admin-staging/ (gitignore 대상).
// public/ 밖에 두는 이유: public 안에 두면 `yarn build` 때 등록 안 된 짤까지 배포본에 복사된다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const store = require('./store');
const { suggestTags } = require('./suggest-tags');
const { importOne, EXT_MAP } = require(path.join(store.DATA_DIR, 'import-tagged-images.js'));

const STAGING_DIR = path.join(store.ROOT, '.admin-staging');
const FORMAT_EXT = { gif: '.gif', jpeg: '.jpg', png: '.png', webp: '.webp' };

const metaPath = (id) => path.join(STAGING_DIR, `${id}.json`);
const readMeta = (id) => store.readJson(metaPath(id));
const writeMeta = (meta) => fs.writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2), 'utf8');
const filePath = (meta) => path.join(STAGING_DIR, meta.file);

function notFound(id) {
  const err = new Error(`대기 중인 짤 ${id} 이(가) 없어`);
  err.status = 404;
  return err;
}

function listStaged() {
  if (!fs.existsSync(STAGING_DIR)) return [];
  return fs.readdirSync(STAGING_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => store.readJson(path.join(STAGING_DIR, f)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function getStaged(id) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !fs.existsSync(metaPath(id))) throw notFound(id);
  return readMeta(id);
}

async function stageUpload(buffer, originalName) {
  // 확장자는 파일 이름이 아니라 실제 내용으로 정한다(클립보드 붙여넣기는 이름이 image.png 뿐이다).
  let format;
  try {
    format = (await sharp(buffer, { animated: true }).metadata()).format;
  } catch {
    format = null;
  }
  const ext = FORMAT_EXT[format];
  if (!ext || !EXT_MAP[ext]) {
    const err = new Error(`지원하지 않는 형식이야 (${format || '알 수 없음'}). gif/jpg/png/webp 만 돼.`);
    err.status = 400;
    throw err;
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });
  const id = crypto.randomUUID();
  const hash = crypto.createHash('md5').update(buffer).digest('hex');
  const dup = store.findByMd5(hash) || listStaged().find(m => m.md5 === hash);
  const meta = {
    id,
    file: `${id}${ext}`,
    ext,
    originalName: store.nfc(originalName || `붙여넣기${ext}`),
    size: buffer.length,
    md5: hash,
    duplicateOf: dup ? { id: dup.id, name: dup.name || dup.draft?.name || dup.originalName, staged: !!dup.md5 } : null,
    status: 'suggesting',
    draft: null,
    error: null,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath(meta), buffer);
  writeMeta(meta);
  runSuggestion(id); // 응답을 기다리지 않고 백그라운드에서 초안을 만든다
  return meta;
}

async function runSuggestion(id, hint) {
  let meta = getStaged(id);
  meta = { ...meta, status: 'suggesting', error: null, hint: hint ?? meta.hint ?? '' };
  writeMeta(meta);
  try {
    const draft = await suggestTags(filePath(meta), { originalName: meta.originalName, hint: meta.hint });
    if (!fs.existsSync(metaPath(id))) return; // 그 사이 삭제·등록됨
    writeMeta({ ...readMeta(id), status: 'ready', draft, error: null });
  } catch (e) {
    if (!fs.existsSync(metaPath(id))) return;
    writeMeta({ ...readMeta(id), status: 'error', error: e.message });
  }
}

function retrySuggestion(id, hint) {
  getStaged(id);
  runSuggestion(id, hint);
  return readMeta(id);
}

function removeStaged(id) {
  const meta = getStaged(id);
  fs.rmSync(filePath(meta), { force: true });
  fs.rmSync(metaPath(id), { force: true });
}

async function commitStaged(id, fields) {
  const meta = getStaged(id);
  const clean = store.validateFields(fields);
  const record = await importOne({ srcPath: filePath(meta), ...clean });
  fs.rmSync(metaPath(id), { force: true });
  store.rememberMd5(meta.md5, record);
  store.regenerateData();
  return record;
}

// 서버가 재시작되면 'suggesting' 상태로 멈춘 항목은 다시 돌린다.
function resumePending() {
  for (const meta of listStaged()) if (meta.status === 'suggesting') runSuggestion(meta.id);
}

module.exports = { STAGING_DIR, listStaged, getStaged, stageUpload, retrySuggestion, removeStaged, commitStaged, resumePending };
