// 짤 이미지를 보고 이름·감정·상황·태그 초안을 만든다.
// 🔑 Claude 구독 안에서만 돈다: 로컬 `claude -p`(Claude Code CLI, 로그인된 구독 계정)를 호출하고,
//    ANTHROPIC_API_KEY 는 자식 프로세스 환경에서 지워서 API 과금으로 넘어가지 않게 한다.
//    `--bare` 는 API 키 인증만 받으므로 쓰지 않는다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');
const { readTaxonomy, listImages } = require('./store');

const MODEL = process.env.JJAL_TAG_MODEL || 'sonnet';
const TIMEOUT_MS = 120000;
const PREVIEW_HEIGHT = 384;
const WORK_DIR = path.join(os.tmpdir(), 'storage-jjal-tagger');

// AI 에게 보여줄 미리보기 PNG 를 만든다. 움직이는 GIF/WEBP 는 처음·중간·끝 프레임을 가로로 붙인다.
async function buildPreview(srcPath, outPath) {
  const meta = await sharp(srcPath, { animated: true }).metadata();
  const pages = meta.pages || 1;
  const frameIdx = pages > 2 ? [0, Math.floor(pages / 2), pages - 1] : [0];
  const frames = await Promise.all(frameIdx.map(page =>
    sharp(srcPath, { page }).resize({ height: PREVIEW_HEIGHT, withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
  ));
  if (frames.length === 1) {
    fs.writeFileSync(outPath, frames[0].data);
    return { outPath, frames: 1 };
  }
  const gap = 8;
  const width = frames.reduce((w, f) => w + f.info.width, 0) + gap * (frames.length - 1);
  const height = Math.max(...frames.map(f => f.info.height));
  let left = 0;
  const composite = frames.map(f => {
    const item = { input: f.data, left, top: 0 };
    left += f.info.width + gap;
    return item;
  });
  await sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).composite(composite).png().toFile(outPath);
  return { outPath, frames: frames.length };
}

// 최근 Claude 가 직접 태깅한 짤(added 필드가 있는 것) 중 몇 개를 스타일 예시로 쓴다.
function pickExamples(limit = 6) {
  const tagged = listImages().filter(r => r.added && r.tag).sort((a, b) => Number(b.id) - Number(a.id));
  return tagged.slice(0, limit).map(r => ({ name: r.name, emotion: r.emotion, situation: r.situation, tag: r.tag }));
}

function buildPrompt(previewPath, { frames, originalName, hint }) {
  const taxonomy = readTaxonomy();
  const fmt = (axis) => taxonomy[axis].map(t => `- ${t.ko} (${t.en.join(', ')})`).join('\n');
  return [
    `이미지 파일 ${previewPath} 를 Read 도구로 열어서 직접 보고, 이 짤(리액션 이미지)의 태그 초안을 만들어.`,
    frames > 1 ? `움직이는 짤이라서 처음·중간·끝 프레임 ${frames}장을 왼쪽부터 순서대로 이어 붙였어. 전체 흐름을 보고 판단해.` : '',
    originalName ? `업로드할 때 원래 파일 이름: "${originalName}" (의미 있는 단어면 참고하고, 카톡 저장명 같은 무의미한 이름이면 무시해)` : '',
    hint ? `오빠가 남긴 메모: "${hint}" — 이 메모를 가장 중요하게 반영해.` : '',
    '',
    '## 규칙',
    '- name: 사람들이 이 짤을 부르는 짧은 한글 이름. 이미지 안에 글자(자막·말풍선)가 있으면 그 문구를 그대로 쓰는 게 제일 좋아.',
    '- emotion: 아래 감정 목록에서만 1~2개.',
    '- situation: 아래 상황 목록에서만 1~2개. "이 짤을 카톡에서 언제 보내는가"를 기준으로 골라.',
    '- tag: 검색에 쓰이는 키워드. 쉼표로 구분하고, 개념 하나마다 "한글, English" 짝으로 넣어(예: "고양이, Cat, 하품, Yawn"). 5~10개 개념.',
    '  이미지 속 글자, 등장 대상(동물·인물·캐릭터), 행동, 출처(드라마·만화 이름을 확실히 알 때만), 사람들이 검색할 법한 상황 단어를 넣어.',
    '  확실하지 않은 인물·작품 이름은 지어내지 마.',
    '',
    '## 감정 목록',
    fmt('emotion'),
    '',
    '## 상황 목록',
    fmt('situation'),
    '',
    '## 기존 짤 예시 (이 스타일을 따라)',
    ...pickExamples().map(e => JSON.stringify(e)),
  ].filter(line => line !== '').join('\n');
}

function buildSchema() {
  const taxonomy = readTaxonomy();
  return {
    type: 'object',
    properties: {
      name: { type: 'string' },
      emotion: { type: 'array', items: { type: 'string', enum: taxonomy.emotion.map(t => t.ko) }, minItems: 1, maxItems: 2 },
      situation: { type: 'array', items: { type: 'string', enum: taxonomy.situation.map(t => t.ko) }, minItems: 1, maxItems: 2 },
      tag: { type: 'string' },
      reason: { type: 'string', description: '이렇게 분류한 이유를 한 문장으로' },
    },
    required: ['name', 'emotion', 'situation', 'tag', 'reason'],
  };
}

function runClaude(prompt, schema) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY; // 구독 계정으로만 실행
    delete env.ANTHROPIC_AUTH_TOKEN;
    const args = [
      '-p', prompt,
      '--model', MODEL,
      '--system-prompt', '너는 한국 짤(리액션 이미지) 저장소의 태그 담당이야. 이미지를 직접 보고 정해진 형식으로만 답해.',
      '--setting-sources', '', // 사용자·프로젝트 설정(CLAUDE.md, 훅)을 읽지 않아 구독 사용량을 줄인다
      '--strict-mcp-config', // MCP 서버를 띄우지 않는다
      '--disable-slash-commands',
      '--tools', 'Read',
      '--allowedTools', 'Read',
      '--no-session-persistence',
      '--json-schema', JSON.stringify(schema),
      '--output-format', 'json',
    ];
    fs.mkdirSync(WORK_DIR, { recursive: true });
    const child = spawn('claude', args, { cwd: WORK_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('AI 초안 생성이 시간 초과됐어 (120초)')); }, TIMEOUT_MS);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(timer); reject(new Error(`claude CLI 실행 실패: ${e.message}`)); });
    child.on('close', code => {
      clearTimeout(timer);
      let parsed;
      try { parsed = JSON.parse(out); } catch {
        return reject(new Error(`claude CLI 응답을 읽지 못했어 (exit ${code}): ${(err || out).slice(0, 300)}`));
      }
      if (parsed.is_error || !parsed.structured_output) {
        return reject(new Error(`AI 초안 실패: ${String(parsed.result || err).slice(0, 300)}`));
      }
      resolve(parsed.structured_output);
    });
  });
}

// 동시에 너무 많이 띄우지 않도록 2개씩만 돌린다.
const MAX_CONCURRENT = 2;
let running = 0;
const queue = [];
function limit(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      running++;
      fn().then(resolve, reject).finally(() => {
        running--;
        if (queue.length) queue.shift()();
      });
    };
    if (running < MAX_CONCURRENT) run(); else queue.push(run);
  });
}

async function suggestTags(srcPath, { originalName, hint } = {}) {
  return limit(async () => {
    fs.mkdirSync(WORK_DIR, { recursive: true });
    const previewPath = path.join(WORK_DIR, `${path.basename(srcPath)}.preview.png`);
    try {
      const { frames } = await buildPreview(srcPath, previewPath);
      const draft = await runClaude(buildPrompt(previewPath, { frames, originalName, hint }), buildSchema());
      return { ...draft, model: MODEL };
    } finally {
      fs.rmSync(previewPath, { force: true });
    }
  });
}

module.exports = { suggestTags, buildPreview, buildPrompt };

// CLI: node admin/server/suggest-tags.js <이미지 경로> [메모]
if (require.main === module) {
  const [file, hint] = process.argv.slice(2);
  if (!file) {
    console.error('사용법: node admin/server/suggest-tags.js <이미지 경로> [메모]');
    process.exit(1);
  }
  suggestTags(path.resolve(file), { originalName: path.basename(file), hint })
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e.message); process.exit(1); });
}
