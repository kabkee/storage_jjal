// 관리 화면에서 바꾼 짤 데이터만 골라 커밋하고, 원하면 push(= Amplify 자동 배포)한다.
const { execFileSync } = require('child_process');
const store = require('./store');

const DEPLOY_BRANCH = 'jjal_kabkee';
// 관리 화면이 건드리는 경로만 커밋한다. 코드 변경은 절대 같이 들어가지 않는다.
const DATA_PATHS = [
  'public/assets/data/sources',
  'public/assets/data/taxonomy.json',
  'public/assets/gif',
  'public/assets/jpg',
  'public/assets/png',
  'public/assets/webp',
  'public/assets/thumbs',
];

const git = (...args) => execFileSync('git', args, { cwd: store.ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function headRecords() {
  const map = new Map();
  for (const type of store.SOURCE_TYPES) {
    let text;
    try { text = git('show', `HEAD:public/assets/data/sources/${type}.json`); } catch { continue; }
    for (const rec of JSON.parse(text)) map.set(String(rec.id), rec);
  }
  return map;
}

// HEAD 와 비교해서 새로 추가된 짤과 수정된 짤을 구한다.
function dataChanges() {
  const before = headRecords();
  const added = [];
  const updated = [];
  const fields = ['name', 'emotion', 'situation', 'tag'];
  for (const rec of store.listImages()) {
    const old = before.get(String(rec.id));
    if (!old) { added.push({ id: rec.id, name: rec.name }); continue; }
    const changed = fields.filter(f => JSON.stringify(old[f] ?? null) !== JSON.stringify(rec[f] ?? null));
    if (changed.length) updated.push({ id: rec.id, name: rec.name, fields: changed, before: Object.fromEntries(changed.map(f => [f, old[f]])) });
  }
  const now = new Set(store.listImages().map(r => String(r.id)));
  const removed = [...before.values()].filter(r => !now.has(String(r.id))).map(r => ({ id: r.id, name: r.name }));
  let taxonomyChanged = false;
  try { taxonomyChanged = git('diff', '--name-only', 'HEAD', '--', 'public/assets/data/taxonomy.json') !== ''; } catch { /* noop */ }
  return { added, updated, removed, taxonomyChanged };
}

function status() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const files = git('status', '--porcelain', '--untracked-files=all', '--', ...DATA_PATHS).split('\n').filter(Boolean);
  let unpushed = [];
  try {
    unpushed = git('log', '--format=%h %s', `origin/${branch}..HEAD`).split('\n').filter(Boolean);
  } catch { /* 원격 브랜치가 없으면 비워 둔다 */ }
  return { branch, deployBranch: DEPLOY_BRANCH, changedFiles: files.length, unpushed, ...dataChanges() };
}

function buildMessage({ added, updated, removed, taxonomyChanged }) {
  const names = (list) => list.slice(0, 5).map(r => r.name).join(', ') + (list.length > 5 ? ` 외 ${list.length - 5}개` : '');
  const parts = [];
  if (added.length) parts.push(`add ${added.length} image${added.length > 1 ? 's' : ''} (${names(added)})`);
  if (updated.length) parts.push(`update tags of ${updated.length} image${updated.length > 1 ? 's' : ''} (${names(updated)})`);
  if (removed.length) parts.push(`remove ${removed.length} image${removed.length > 1 ? 's' : ''}`);
  if (taxonomyChanged) parts.push('update taxonomy');
  return `feat(data): ${parts.join(', ') || 'update data'}`;
}

function publish({ push }) {
  const problems = store.validateAll();
  if (problems.length) {
    const err = new Error(`데이터 점검에서 문제가 나왔어:\n${problems.slice(0, 10).join('\n')}`);
    err.status = 400;
    throw err;
  }
  const st = status();
  let committed = null;
  if (st.changedFiles > 0) {
    git('add', '-A', '--', ...DATA_PATHS);
    const message = buildMessage(st);
    git('commit', '-m', message, '--', ...DATA_PATHS);
    committed = { sha: git('rev-parse', '--short', 'HEAD'), message };
  }
  let pushed = false;
  if (push) {
    if (st.branch !== DEPLOY_BRANCH) {
      const err = new Error(`지금 브랜치가 ${st.branch} 라서 push 안 했어. 배포는 ${DEPLOY_BRANCH} 브랜치에서만 해.`);
      err.status = 400;
      throw err;
    }
    git('push', 'origin', DEPLOY_BRANCH);
    pushed = true;
  }
  return { committed, pushed, status: status() };
}

module.exports = { status, publish, buildMessage, DATA_PATHS };
