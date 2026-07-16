# 짤 저장소 감정/상황 분류체계 + UX 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `category_1`(파일형식)/`category_2`(미사용)를 감정(emotion)/상황(situation) 다중 태그 체계로 교체하고, PC 칩바 + 모바일 필터 바텀시트 UI를 도입하며, 한글 인코딩 안전장치와 썸네일 기반 이미지 최적화를 추가한 뒤, Downloads 폴더의 신규 이미지 11개를 반영하고 빌드 검증 후 Amplify에 배포한다.

**Architecture:** 데이터 스키마는 `emotion`/`situation`(문자열 배열) + 기존 `tag`(자유 키워드, 한/영 병기) 필드로 구성하고, 감정/상황의 정식 목록은 `public/assets/data/taxonomy.json` 하나로 관리해 태깅 워크플로우와 프론트엔드가 같은 소스를 참조한다. 필터/검색의 핵심 로직(`matchesSearch`, `matchesFacetFilters`)은 `src/utils/`의 순수 함수로 분리해 Vitest로 단위 테스트하고, `AppContent.vue`는 이 함수들을 호출만 한다. 신규 이미지 반입은 Gemini API 호출을 제거하고, Claude Code 세션이 이미지를 직접 읽어 만든 매니페스트(JSON)를 `import-tagged-images.js`가 기계적으로 처리(UUID 파일명 변경, 폴더 이동, `sharp` 썸네일 생성, sources JSON 갱신)하는 구조로 바꾼다.

**Tech Stack:** Vue 3 + Vuetify 3 + Vite (기존), Vitest(신규, `src/**` 순수 로직 테스트), `sharp`(신규, Node 스크립트 전용 썸네일 생성), Node `assert` 기반 스모크 테스트(`public/assets/data/**` CommonJS 스크립트용, 기존 스크립트 관례 유지).

## Global Constraints

- `category_1`/`category_2` 필드는 더 이상 사용하지 않는다. 새 레코드는 `emotion`(배열), `situation`(배열)을 쓴다. 파일 형식은 `file` 확장자로 판별한다(신규 필드 없음).
- 감정/상황의 정식 목록은 `public/assets/data/taxonomy.json` 하나에서만 관리한다. 새 태그가 필요하면 이 파일에 추가한다.
- `tag`(자유 키워드) 필드는 개념 하나당 한글/영어를 항상 짝으로 등록한다(중복이어도 무방).
- 모든 한글 문자열은 JSON에 쓰기 전에 `.normalize('NFC')`를 적용한다.
- 파일 경로(파일명)는 항상 UUID + 원본 확장자만 사용한다. 한글/비ASCII 문자가 파일시스템 경로에 들어가면 안 된다.
- PC: 검색창 아래 감정 칩 줄 + 상황 칩 줄을 아코디언 없이 항상 펼쳐서 표시(사이드바 없음). 모바일: 검색창 + "필터(N)" 버튼 → 바텀시트.
- 필터 로직: 같은 축(감정 또는 상황) 안에서는 OR, 축 사이에서는 AND.
- 그리드 썸네일은 `sharp`로 생성한 240x240 webp(`thumb` 필드)를 쓰고, 원본(`file`)은 클립보드 복사/저장에만 쓴다. GIF 썸네일은 첫 프레임 정지 이미지.
- 기존 310개 이미지의 감정/상황 소급 태깅과 썸네일 백필은 이 플랜의 범위 밖이다(예외: `id: 128` 데이터 손상 수정은 포함).
- `src/**` 순수 로직은 Vitest로 테스트한다. `public/assets/data/**`의 CommonJS 스크립트는 기존 관례대로 프레임워크 없이 Node `assert` 기반 스모크 테스트 파일로 검증한다(파일명 접미사 `.smoketest.js`, `node <path>`로 직접 실행).
- 배포는 AWS Amplify. 실제 push 전에 사용자에게 Amplify가 어느 브랜치를 빌드 트리거로 쓰는지 반드시 재확인한다(Task 11).

---

## Task 1: 한글 정규화 유틸 + Vitest 셋업

**Files:**
- Create: `vitest.config.mjs`
- Create: `src/utils/textNormalize.js`
- Test: `src/utils/textNormalize.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeKorean(str: string): string` — NFC 정규화 + 소문자화. `includesNormalized(haystack: string, needle: string): boolean` — 정규화 후 부분일치.

- [ ] **Step 1: Vitest 의존성 추가**

`package.json`의 `devDependencies`에 추가:
```json
"vitest": "^2.1.4"
```

Run: `yarn add -D vitest`

- [ ] **Step 2: Vitest 설정 파일 작성**

`vitest.config.mjs`:
```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js']
  }
})
```

- [ ] **Step 3: `package.json`에 test 스크립트 추가**

`scripts`에 추가:
```json
"test": "vitest run"
```

- [ ] **Step 4: 실패하는 테스트 작성**

`src/utils/textNormalize.test.js`:
```js
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
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `yarn test`
Expected: FAIL — `Cannot find module './textNormalize'`

- [ ] **Step 6: 구현**

`src/utils/textNormalize.js`:
```js
export function normalizeKorean(str) {
  if (!str) return ''
  return str.normalize('NFC').toLowerCase()
}

export function includesNormalized(haystack, needle) {
  if (!haystack || !needle) return false
  return normalizeKorean(haystack).includes(normalizeKorean(needle))
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `yarn test`
Expected: PASS (7 tests)

- [ ] **Step 8: 커밋**

```bash
git add package.json yarn.lock vitest.config.mjs src/utils/textNormalize.js src/utils/textNormalize.test.js
git commit -m "test: add NFC-normalized string matching utility"
```

---

## Task 2: 필터/검색 순수 로직 (`imageFilter.js`)

**Files:**
- Create: `src/utils/imageFilter.js`
- Test: `src/utils/imageFilter.test.js`

**Interfaces:**
- Consumes: `normalizeKorean`, `includesNormalized` from `./textNormalize` (Task 1)
- Produces: `matchesSearch(image: object, query: string): boolean`, `matchesFacetFilters(image: object, selected: { emotion?: string[], situation?: string[] }): boolean` — `AppContent.vue`(Task 8)가 그대로 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/utils/imageFilter.test.js`:
```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn test`
Expected: FAIL — `Cannot find module './imageFilter'`

- [ ] **Step 3: 구현**

`src/utils/imageFilter.js`:
```js
import { includesNormalized } from './textNormalize'

export function matchesSearch(image, query) {
  if (!query) return true
  const scalarFields = [image.name, image.tag, image.file]
  const arrayFields = [image.emotion, image.situation]

  const inScalar = scalarFields.some(f => includesNormalized(f, query))
  if (inScalar) return true

  return arrayFields.some(arr =>
    Array.isArray(arr) && arr.some(v => includesNormalized(v, query))
  )
}

export function matchesFacetFilters(image, selected) {
  const emotion = (selected && selected.emotion) || []
  const situation = (selected && selected.situation) || []

  const emotionOk = emotion.length === 0 ||
    (Array.isArray(image.emotion) && image.emotion.some(e => emotion.includes(e)))
  const situationOk = situation.length === 0 ||
    (Array.isArray(image.situation) && image.situation.some(s => situation.includes(s)))

  return emotionOk && situationOk
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn test`
Expected: PASS (all tests, 13+ total)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/imageFilter.js src/utils/imageFilter.test.js
git commit -m "test: add facet/search matching logic for emotion+situation filters"
```

---

## Task 3: 분류체계 마스터 파일 (`taxonomy.json`)

**Files:**
- Create: `public/assets/data/taxonomy.json`

**Interfaces:**
- Produces: `{ emotion: {ko, en[]}[], situation: {ko, en[]}[] }` — `AppContent.vue`(Task 8)가 `fetch`로 읽어 칩 목록을 렌더링. `import-tagged-images.js`(Task 5)를 실행하는 사람이 태깅 시 이 목록에서 값을 고른다.

- [ ] **Step 1: taxonomy.json 작성**

기존 228개 짤의 태그 데이터 분석(웃음/슬픔/분노/당황 등 빈출) + 신규 11개 이미지 태깅 중 식별된 누락 태그(기쁨/행복, 혐오/역겨움, 비난/지적, 한턱/쏘기)를 반영한 최종 목록:

`public/assets/data/taxonomy.json`:
```json
{
    "emotion": [
        { "ko": "웃김", "en": ["Funny", "Hilarious", "LOL"] },
        { "ko": "황당", "en": ["Absurd", "WTF", "Dumbfounded"] },
        { "ko": "분노", "en": ["Angry", "Furious", "Rage"] },
        { "ko": "슬픔", "en": ["Sad", "Sorrow"] },
        { "ko": "놀람/충격", "en": ["Shocked", "Surprised"] },
        { "ko": "소름/무서움", "en": ["Creeped out", "Scared"] },
        { "ko": "부끄러움/민망", "en": ["Embarrassed", "Awkward"] },
        { "ko": "지침/귀찮음", "en": ["Exhausted", "Annoyed"] },
        { "ko": "자신감/뿌듯", "en": ["Confident", "Proud"] },
        { "ko": "무표정/시크", "en": ["Deadpan", "Nonchalant"] },
        { "ko": "불신/의심", "en": ["Doubtful", "Suspicious"] },
        { "ko": "사랑/설렘", "en": ["Affection", "Excited (romance)"] },
        { "ko": "귀여움", "en": ["Cute"] },
        { "ko": "기쁨/행복", "en": ["Happy", "Joyful"] },
        { "ko": "혐오/역겨움", "en": ["Disgust", "Gross"] }
    ],
    "situation": [
        { "ko": "인사", "en": ["Greeting"] },
        { "ko": "동의/긍정", "en": ["Agree", "Positive"] },
        { "ko": "거절/부정", "en": ["Refuse", "Negative"] },
        { "ko": "질문/궁금", "en": ["Question", "Curious"] },
        { "ko": "축하", "en": ["Congrats", "Celebration"] },
        { "ko": "위로/공감", "en": ["Comfort", "Empathy"] },
        { "ko": "감사", "en": ["Thanks"] },
        { "ko": "사과", "en": ["Apology"] },
        { "ko": "재촉/독촉", "en": ["Urging", "Nagging"] },
        { "ko": "놀리기/드립", "en": ["Teasing", "Joke"] },
        { "ko": "자랑", "en": ["Bragging"] },
        { "ko": "신세한탄", "en": ["Complaining", "Venting"] },
        { "ko": "회사/업무", "en": ["Work", "Office"] },
        { "ko": "밥/먹방/술", "en": ["Food", "Mukbang", "Drinking"] },
        { "ko": "비난/지적", "en": ["Criticism", "Calling out"] },
        { "ko": "한턱/쏘기", "en": ["Treating", "Paying for others"] }
    ]
}
```

- [ ] **Step 2: JSON 유효성 확인**

Run: `node -e "console.log(Object.keys(require('./public/assets/data/taxonomy.json')))"`
Expected: `[ 'emotion', 'situation' ]` 출력, 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add public/assets/data/taxonomy.json
git commit -m "feat(data): add emotion/situation taxonomy master list"
```

---

## Task 4: 썸네일 생성기 (`sharp`)

**Files:**
- Create: `public/assets/data/generate-thumbnail.js`
- Test: `public/assets/data/generate-thumbnail.smoketest.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `generateThumbnail(srcPath: string, destPath: string): Promise<string>` (CommonJS `module.exports`) — Task 5의 `import-tagged-images.js`가 소비.

- [ ] **Step 1: sharp 의존성 추가**

Run: `yarn add -D sharp`

- [ ] **Step 2: 구현**

`public/assets/data/generate-thumbnail.js`:
```js
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const THUMB_SIZE = 240;

async function generateThumbnail(srcPath, destPath) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    await sharp(srcPath, { animated: false })
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
        .webp({ quality: 82 })
        .toFile(destPath);
    return destPath;
}

module.exports = { generateThumbnail, THUMB_SIZE };
```

- [ ] **Step 3: 스모크 테스트 작성 (기존 저장소의 작은 fixture 이미지 사용)**

`public/assets/data/generate-thumbnail.smoketest.js`:
```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { generateThumbnail, THUMB_SIZE } = require('./generate-thumbnail');

async function run() {
    const tmpDir = path.join(__dirname, '../../../.tmp-smoketest');

    // JPG 원본 → 정사각 webp 썸네일
    const jpgFixture = path.join(__dirname, '../jpg/12737a6f-f636-4d47-a4cb-31511a662ff1.jpeg');
    const jpgOut = path.join(tmpDir, 'thumb.webp');
    await generateThumbnail(jpgFixture, jpgOut);
    assert.ok(fs.existsSync(jpgOut), 'jpg thumbnail was not created');
    const jpgMeta = await sharp(jpgOut).metadata();
    assert.strictEqual(jpgMeta.width, THUMB_SIZE, `expected width ${THUMB_SIZE}, got ${jpgMeta.width}`);
    assert.strictEqual(jpgMeta.height, THUMB_SIZE, `expected height ${THUMB_SIZE}, got ${jpgMeta.height}`);
    assert.strictEqual(jpgMeta.format, 'webp', `expected webp format, got ${jpgMeta.format}`);

    // GIF 원본 → 정지 이미지(애니메이션 아님) 썸네일
    const gifFixture = path.join(__dirname, '../gif/2efb353937ce31638ab5e9bf2c428e88.gif');
    const gifOut = path.join(tmpDir, 'thumb-gif.webp');
    await generateThumbnail(gifFixture, gifOut);
    assert.ok(fs.existsSync(gifOut), 'gif thumbnail was not created');
    const gifMeta = await sharp(gifOut).metadata();
    assert.strictEqual(gifMeta.pages, undefined, 'gif thumbnail should be a single static frame, not animated');

    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('✅ generate-thumbnail smoke test passed');
}

run().catch(err => { console.error('❌ smoke test failed:', err); process.exit(1); });
```

- [ ] **Step 4: 스모크 테스트 실행**

Run: `node public/assets/data/generate-thumbnail.smoketest.js`
Expected: `✅ generate-thumbnail smoke test passed` 출력, exit code 0

- [ ] **Step 5: 커밋**

```bash
git add package.json yarn.lock public/assets/data/generate-thumbnail.js public/assets/data/generate-thumbnail.smoketest.js
git commit -m "feat(data): add sharp-based grid thumbnail generator"
```

---

## Task 5: 신규 이미지 반입 파이프라인 (`import-tagged-images.js`) + Gemini 파이프라인 폐기

**Files:**
- Create: `public/assets/data/import-tagged-images.js`
- Test: `public/assets/data/import-tagged-images.smoketest.js`
- Delete: `public/assets/data/process-new-images.js` (git 미추적 파일, Gemini 기반 구파이프라인)
- Delete: `public/assets/data/generate-tags-gemini.js` (git 미추적 파일, Gemini 기반 구파이프라인)
- Modify: `package.json`

**Interfaces:**
- Consumes: `generateThumbnail` from `./generate-thumbnail` (Task 4)
- Produces: `buildRecord({ id, uuid, ext, folder, name, emotion, situation, tag }): object` (module.exports, 테스트 및 향후 재사용을 위해 export)

- [ ] **Step 1: 구현**

`public/assets/data/import-tagged-images.js`:
```js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateThumbnail } = require('./generate-thumbnail');

const NEW_DIR = path.join(__dirname, '../new');
const ASSETS_DIR = path.join(__dirname, '../../assets');
const THUMBS_DIR = path.join(__dirname, '../../assets/thumbs');
const SOURCES_DIR = path.join(__dirname, 'sources');
const MANIFEST_PATH = path.join(__dirname, 'new-images.manifest.json');

const EXT_MAP = {
    '.jpg': { folder: 'jpg', json: 'jpg.json' },
    '.jpeg': { folder: 'jpg', json: 'jpg.json' },
    '.png': { folder: 'png', json: 'png.json' },
    '.gif': { folder: 'gif', json: 'gif.json' },
    '.webp': { folder: 'webp', json: 'webp.json' },
};

function buildRecord({ id, uuid, ext, folder, name, emotion, situation, tag }) {
    const normalize = (s) => (s || '').normalize('NFC');
    return {
        id: String(id),
        name: normalize(name),
        file: `assets/${folder}/${uuid}${ext}`,
        thumb: `assets/thumbs/${uuid}.webp`,
        emotion: (emotion || []).map(normalize),
        situation: (situation || []).map(normalize),
        tag: normalize(tag)
    };
}

function getNextId(data) {
    if (!data || data.length === 0) return 1;
    return data.reduce((max, item) => {
        const id = parseInt(item.id, 10);
        return isNaN(id) ? max : Math.max(max, id);
    }, 0) + 1;
}

async function importAll() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error(`Manifest not found: ${MANIFEST_PATH}`);
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

    for (const entry of manifest) {
        const ext = path.extname(entry.sourceFilename).toLowerCase();
        const config = EXT_MAP[ext];
        if (!config) {
            console.warn(`⚠️ 지원하지 않는 확장자, 건너뜀: ${entry.sourceFilename}`);
            continue;
        }

        const srcPath = path.join(NEW_DIR, entry.sourceFilename);
        if (!fs.existsSync(srcPath)) {
            console.warn(`⚠️ 파일을 찾을 수 없음, 건너뜀: ${srcPath}`);
            continue;
        }

        const uuid = crypto.randomUUID();
        const targetDir = path.join(ASSETS_DIR, config.folder);
        fs.mkdirSync(targetDir, { recursive: true });
        const destPath = path.join(targetDir, `${uuid}${ext}`);
        fs.renameSync(srcPath, destPath);

        fs.mkdirSync(THUMBS_DIR, { recursive: true });
        await generateThumbnail(destPath, path.join(THUMBS_DIR, `${uuid}.webp`));

        const jsonPath = path.join(SOURCES_DIR, config.json);
        const jsonData = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : [];
        const record = buildRecord({
            id: getNextId(jsonData), uuid, ext, folder: config.folder,
            name: entry.name, emotion: entry.emotion, situation: entry.situation, tag: entry.tag
        });
        jsonData.push(record);
        fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 4), 'utf8');

        console.log(`✅ ${entry.sourceFilename} -> ${record.file}`);
    }

    fs.writeFileSync(MANIFEST_PATH, '[]', 'utf8');
    console.log('모든 이미지 반영 완료. `yarn generate:data`로 data.json을 재생성하세요.');
}

module.exports = { buildRecord, getNextId };

if (require.main === module) {
    importAll().catch(err => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 2: `buildRecord` 순수 함수 스모크 테스트**

`public/assets/data/import-tagged-images.smoketest.js`:
```js
const assert = require('assert');
const { buildRecord } = require('./import-tagged-images');

const nfdName = '자소서'.normalize('NFD') + '거짓말';
const record = buildRecord({
    id: 999, uuid: 'abc-123', ext: '.jpg', folder: 'jpg',
    name: nfdName, emotion: ['웃김'], situation: ['거절/부정'], tag: '고양이, Cat'
});

assert.strictEqual(record.id, '999', 'id must be stringified');
assert.strictEqual(record.name, nfdName.normalize('NFC'), 'name must be NFC-normalized');
assert.strictEqual(record.file, 'assets/jpg/abc-123.jpg', 'file path must be UUID + folder + ext');
assert.strictEqual(record.thumb, 'assets/thumbs/abc-123.webp', 'thumb path must be UUID.webp under thumbs/');
assert.deepStrictEqual(record.emotion, ['웃김']);
assert.deepStrictEqual(record.situation, ['거절/부정']);

const empty = buildRecord({ id: 1, uuid: 'x', ext: '.png', folder: 'png', name: '', emotion: undefined, situation: undefined, tag: undefined });
assert.deepStrictEqual(empty.emotion, [], 'missing emotion defaults to empty array, not undefined');
assert.deepStrictEqual(empty.situation, [], 'missing situation defaults to empty array, not undefined');

console.log('✅ import-tagged-images buildRecord smoke test passed');
```

- [ ] **Step 3: 스모크 테스트 실행**

Run: `node public/assets/data/import-tagged-images.smoketest.js`
Expected: `✅ import-tagged-images buildRecord smoke test passed`

- [ ] **Step 4: Gemini 기반 구파이프라인 삭제 + package.json 정리**

```bash
rm -f public/assets/data/process-new-images.js public/assets/data/generate-tags-gemini.js
```

`package.json`의 `scripts`에서 `"generate:tags"`, `"add-images"` 항목을 삭제하고 대신 추가:
```json
"import-images": "node public/assets/data/import-tagged-images.js"
```

`package.json`의 `dependencies`에서 `"@google/generative-ai"`, `"dotenv"`를 삭제한다(두 항목을 쓰던 파일이 모두 삭제됨, 다른 소비처 없음 확인됨).

Run: `yarn install`
Expected: lockfile이 두 패키지 제거를 반영해 갱신됨, 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add package.json yarn.lock public/assets/data/import-tagged-images.js public/assets/data/import-tagged-images.smoketest.js
git rm public/assets/data/process-new-images.js public/assets/data/generate-tags-gemini.js 2>/dev/null || true
git commit -m "feat(data): replace Gemini tagging pipeline with manifest-driven import script"
```

---

## Task 6: 신규 이미지 11개 반입 (Downloads 폴더)

**Files:**
- Create (temp): `public/assets/data/new-images.manifest.json`
- Modify (generated): `public/assets/data/sources/{gif,jpg,png,webp}.json`, `public/assets/data.json`
- Create (generated): `public/assets/thumbs/*.webp`

이 태스크는 브레인스토밍 세션에서 11개 이미지를 직접 확인하고 정한 태그를 그대로 반입한다(`내우산.gif`은 사용자 확인대로 "황당/위험한 순간" 리액션으로 처리).

- [ ] **Step 1: 원본 파일을 `public/assets/new/`로 복사**

```bash
mkdir -p public/assets/new
cp "/Users/kabkee/Downloads/짤_업데이트 전/KakaoTalk_Photo_2026-01-07-15-09-40.gif" public/assets/new/
cp "/Users/kabkee/Downloads/짤_업데이트 전/내우산.gif" public/assets/new/
cp "/Users/kabkee/Downloads/짤_업데이트 전/니가그러고도사람이야.webp" public/assets/new/
cp "/Users/kabkee/Downloads/짤_업데이트 전/못들었어다시말해줄래.jpg" public/assets/new/
cp "/Users/kabkee/Downloads/짤_업데이트 전/아싸호랑나비.webp" public/assets/new/
cp "/Users/kabkee/Downloads/짤_업데이트 전/주가에따라바뀌는내직업1.png" public/assets/new/
cp "/Users/kabkee/Downloads/짤_업데이트 전/주가에따라바뀌는내직업2.png" public/assets/new/
cp "/Users/kabkee/Downloads/짤_업데이트 전/주인님,얼른자살을.jpg" public/assets/new/
cp "/Users/kabkee/Downloads/짤_업데이트 전/카드받아라.gif" public/assets/new/
cp "/Users/kabkee/Downloads/짤_업데이트 전/허걱.jpg" public/assets/new/
cp "/Users/kabkee/Downloads/짤_업데이트 전/흡족.jpg" public/assets/new/
ls public/assets/new/ | wc -l
```
Expected: `11`

- [ ] **Step 2: 매니페스트 작성**

`public/assets/data/new-images.manifest.json`:
```json
[
  { "sourceFilename": "KakaoTalk_Photo_2026-01-07-15-09-40.gif", "name": "환한미소", "emotion": ["기쁨/행복"], "situation": ["인사"], "tag": "미소, Smile, 인사, Greeting, 밝은표정, Bright expression" },
  { "sourceFilename": "내우산.gif", "name": "내우산", "emotion": ["황당", "놀람/충격"], "situation": [], "tag": "블랙박스, Dashcam, 무단횡단, Jaywalking, 우산, Umbrella, 위험, Danger, 비, Rain" },
  { "sourceFilename": "니가그러고도사람이야.webp", "name": "니가그러고도사람이야", "emotion": ["분노", "황당"], "situation": ["비난/지적"], "tag": "너구리, Raccoon, 배신감, Betrayal, 이빨, Fangs, 화남, Angry animal" },
  { "sourceFilename": "못들었어다시말해줄래.jpg", "name": "못들었어다시말해줄래", "emotion": ["지침/귀찮음"], "situation": ["거절/부정"], "tag": "선글라스, Sunglasses, 헤드폰, Headphones, 못들은척, Pretend not to hear, 무시, Ignore" },
  { "sourceFilename": "아싸호랑나비.webp", "name": "아싸호랑나비", "emotion": ["웃김", "자신감/뿌듯"], "situation": ["축하", "자랑"], "tag": "아싸, Yes, 호랑나비, Tiger butterfly, 언어유희, Pun, 택배박스, Package box" },
  { "sourceFilename": "주가에따라바뀌는내직업1.png", "name": "주가에따라바뀌는내직업1", "emotion": ["웃김", "황당"], "situation": ["신세한탄"], "tag": "주식, Stock, 투자, Investing, 밈툰, Webtoon meme, 분석가, Analyst, 경제전문가, Economist, 예언가, Prophet" },
  { "sourceFilename": "주가에따라바뀌는내직업2.png", "name": "주가에따라바뀌는내직업2", "emotion": ["웃김", "황당"], "situation": ["신세한탄"], "tag": "주식, Stock, 손절, Stop-loss, 장기투자자, Long-term investor, 성직자, Priest, 철학자, Philosopher" },
  { "sourceFilename": "주인님,얼른자살을.jpg", "name": "주인님얼른", "emotion": ["황당"], "situation": ["놀리기/드립"], "tag": "개, Dog, 칼, Knife, 흑백, Black and white, 부조리, Absurd, 과장반응, Exaggerated reaction" },
  { "sourceFilename": "카드받아라.gif", "name": "카드받아라", "emotion": ["자신감/뿌듯", "웃김"], "situation": ["한턱/쏘기"], "tag": "카드, Card, 신용카드, Credit card, 결제, Payment, 한턱, Treat, 쏜다, I'll pay" },
  { "sourceFilename": "허걱.jpg", "name": "허걱", "emotion": ["놀람/충격"], "situation": [], "tag": "Mr. Krabs, 미스터크랩스, 스폰지밥, Spongebob, 비명, Scream, 충격, Shocked" },
  { "sourceFilename": "흡족.jpg", "name": "흡족", "emotion": ["자신감/뿌듯"], "situation": ["자랑"], "tag": "흡족, Satisfied, 미소, Smirk, 배우, Actor" }
]
```

- [ ] **Step 3: 반입 스크립트 실행**

Run: `yarn import-images`
Expected: 11줄의 `✅ <원본파일명> -> assets/<folder>/<uuid>.<ext>` 출력, 에러 없음

- [ ] **Step 4: 결과 검증**

```bash
ls public/assets/new/ | wc -l          # 0 이어야 함 (모두 이동됨)
ls public/assets/thumbs/ | wc -l       # 11 이상이어야 함
node -e "
const files = ['gif','jpg','png','webp'].flatMap(t => require('./public/assets/data/sources/'+t+'.json'));
const names = files.map(f => f.name);
['환한미소','내우산','니가그러고도사람이야','못들었어다시말해줄래','아싸호랑나비','주가에따라바뀌는내직업1','주가에따라바뀌는내직업2','주인님얼른','카드받아라','허걱','흡족'].forEach(n => {
  if (!names.includes(n)) throw new Error('누락: ' + n);
});
console.log('✅ 11개 항목 모두 sources JSON에 반영됨');
"
```
Expected: `✅ 11개 항목 모두 sources JSON에 반영됨`

- [ ] **Step 5: data.json 재생성**

Run: `yarn generate:data`
Expected: `✅ data.json 생성 완료: 321개 항목` (기존 310 + 신규 11)

- [ ] **Step 6: 커밋**

```bash
git add public/assets/data/sources public/assets/data.json public/assets/gif public/assets/jpg public/assets/png public/assets/webp public/assets/thumbs public/assets/data/new-images.manifest.json
git commit -m "feat(data): import 11 new images with emotion/situation tags"
```

---

## Task 7: 손상 데이터 정리 (`id: 128`)

기존 데이터 조사 중 `id: 128`(`assets/jpg/24c1a18a-0a93-4bf3-b266-ae54d2cc2e61.jpeg`) 레코드의 `tag` 필드가 과거 자동 태깅 버그로 10만 자 이상 반복 저장되어 있음을 확인했다(원본 이미지는 애니메이션 억지로 먹이기 장면, "혐오/역겨움" 개그). 이 한 건만 정리한다(다른 309개는 이번 스코프 밖).

**Files:**
- Modify: `public/assets/data/sources/jpg.json`

- [ ] **Step 1: 현재 상태 확인**

Run: `node -e "console.log(require('./public/assets/data/sources/jpg.json').find(d => d.id === '128').tag.length)"`
Expected: `109204` (손상 확인)

- [ ] **Step 2: 레코드 수정**

`public/assets/data/sources/jpg.json`에서 `id: "128"` 레코드를 찾아 `tag` 필드를 교체하고 `emotion`/`situation`을 추가한다(`name`, `file`, `category_1`, `category_2`는 그대로 유지 — 이번 정리는 손상된 `tag`만 고치는 것이 목적):

```json
{
    "id": "128",
    "name": "까분다",
    "file": "assets/jpg/24c1a18a-0a93-4bf3-b266-ae54d2cc2e61.jpeg",
    "tag": "애니메이션, Anime, 억지로먹이기, Force-feeding, 혐오스러운음식, Disgusting food, 놀리기, Teasing, 밥먹이기, Feeding",
    "emotion": ["혐오/역겨움", "황당"],
    "situation": ["놀리기/드립"],
    "category_1": "JPG",
    "category_2": null
}
```

- [ ] **Step 3: 검증**

Run: `node -e "const it = require('./public/assets/data/sources/jpg.json').find(d => d.id === '128'); console.log(it.tag.length, JSON.stringify(it.emotion))"`
Expected: `88 ["혐오/역겨움","황당"]` (정확한 길이는 위 문자열 기준으로 달라질 수 있으나 100자 미만이어야 함)

- [ ] **Step 4: data.json 재생성 + 커밋**

```bash
yarn generate:data
git add public/assets/data/sources/jpg.json public/assets/data.json
git commit -m "fix(data): repair id 128 corrupted tag field (109k-char repetition bug)"
```

---

## Task 8: `AppContent.vue` — 감정/상황 필터 상태 + PC 칩바 + 모바일 바텀시트 UI

**Files:**
- Modify: `src/components/AppContent.vue` (전체 재작성)

**Interfaces:**
- Consumes: `matchesSearch`, `matchesFacetFilters` from `@/utils/imageFilter`(Task 2); `public/assets/data/taxonomy.json`(Task 3, `fetch`로 로드)

- [ ] **Step 1: `AppContent.vue` 전체 내용을 아래로 교체**

```vue
<template>
    <v-row no-gutters>
        <v-col cols="12">
            <v-row no-gutters justify="center">
                <v-col :cols="isMobileCustom ? 12 : 5">
                    <v-sheet class="ma-2 pa-2 elevation-0">
                        <div class="d-flex ga-2">
                            <v-text-field v-model='search' align-self="center" hide-details="auto" label="검색"
                                class="flex-grow-1">
                                <template v-slot:append>
                                    <v-icon color="gray">mdi-magnify</v-icon>
                                </template>
                            </v-text-field>
                            <v-btn v-if="isMobileCustom" variant="outlined" @click="showFilterSheet = true">
                                필터
                                <v-badge v-if="activeFilterCount > 0" :content="activeFilterCount" color="primary"
                                    inline></v-badge>
                            </v-btn>
                        </div>
                    </v-sheet>
                </v-col>
            </v-row>

            <!-- PC: 감정/상황 칩바, 아코디언 없이 항상 펼침 -->
            <v-row v-if="!isMobileCustom && !isShowFav" no-gutters class="px-2">
                <v-col cols="12">
                    <div class="chip-row-label">감정</div>
                    <div class="mb-1">
                        <v-chip class="ma-1" size="small" :color="activeFilterCount === 0 ? 'primary' : undefined"
                            @click="clearFilters()">전체</v-chip>
                        <v-chip v-for="t in taxonomy.emotion" :key="'e-' + t.ko" class="ma-1" size="small"
                            :color="selectedEmotion.includes(t.ko) ? 'primary' : undefined"
                            @click="toggleEmotion(t.ko)">{{ t.ko }}</v-chip>
                    </div>
                    <div class="chip-row-label">상황</div>
                    <div class="mb-2">
                        <v-chip v-for="t in taxonomy.situation" :key="'s-' + t.ko" class="ma-1" size="small"
                            :color="selectedSituation.includes(t.ko) ? 'primary' : undefined"
                            @click="toggleSituation(t.ko)">{{ t.ko }}</v-chip>
                    </div>
                </v-col>
            </v-row>

            <!-- 모바일: 전체/최근 전환 -->
            <div v-if="isMobileCustom" class="pa-2">
                <v-slide-group show-arrows>
                    <v-slide-group-item v-slot="{ toggle }">
                        <v-chip class="ma-1" :color="!isShowFav ? 'primary' : undefined"
                            @click="isShowFav = false; toggle">
                            <v-icon start icon="mdi-home"></v-icon>전체
                        </v-chip>
                    </v-slide-group-item>
                    <v-slide-group-item v-slot="{ toggle }">
                        <v-chip class="ma-1" :color="isShowFav ? 'primary' : undefined" @click="isShowFav = true; toggle">
                            <v-icon start icon="mdi-star"></v-icon>최근
                        </v-chip>
                    </v-slide-group-item>
                </v-slide-group>
            </div>

            <v-row v-if='!isShowFav' no-gutters>
                <div class="d-flex align-center justify-space-between w-100 pr-4">
                    <div class="mr-4 pl-2">
                        총 <span style="font-weight: bold; color: red;">{{ filteredImages.length }}</span>개 짤
                    </div>
                    <div class="d-flex align-center">
                        <v-switch v-model="excludeGif" hide-details inset color="primary" class="mr-2" />
                        <span>GIF 제외</span>
                    </div>
                </div>
                <v-col cols="12" class="d-flex align-content-center flex-wrap ga-2 pl-2">
                    <template v-for='img in filteredImages' :key="img?.file">
                        <div class="image-container">
                            <v-img v-if="img.file" :width="100" :max-width="100" :min-width="100" :max-height="100"
                                aspect-ratio="1/1" cover class="elevation-3" :src="img.thumb || img.file"
                                @click="copyImageToClipboard(img)"></v-img>
                            <div class="hover-text">{{ img.name }}</div>
                        </div>
                    </template>
                </v-col>
            </v-row>
            <v-row v-else no-gutters>
                <v-col cols="12" class="d-flex align-content-center flex-wrap ga-2 pl-2">
                    <template v-for='img in favImages' :key="img?.file">
                        <div class="image-container" @click="copyImageToClipboard(img)">
                            <v-img v-if="img.file" :width="100" :max-width="100" :min-width="100" :max-height="100"
                                aspect-ratio="1/1" cover class="elevation-3" :src="img.thumb || img.file"></v-img>
                            <div class="hover-text">{{ img.name }}</div>
                            <div class="delete" @click="deleteFromFav($event, img)">X</div>
                        </div>
                    </template>
                </v-col>
            </v-row>
        </v-col>
    </v-row>

    <v-bottom-sheet v-model="showFilterSheet">
        <v-sheet class="pa-4" style="max-height: 70vh; overflow-y: auto;">
            <div class="d-flex justify-space-between align-center mb-2">
                <h3>필터</h3>
                <v-btn variant="text" @click="clearFilters()">초기화</v-btn>
            </div>
            <div class="chip-row-label">감정</div>
            <div class="mb-2">
                <v-chip v-for="t in taxonomy.emotion" :key="'me-' + t.ko" class="ma-1"
                    :color="selectedEmotion.includes(t.ko) ? 'primary' : undefined"
                    @click="toggleEmotion(t.ko)">{{ t.ko }}</v-chip>
            </div>
            <div class="chip-row-label">상황</div>
            <div class="mb-2">
                <v-chip v-for="t in taxonomy.situation" :key="'ms-' + t.ko" class="ma-1"
                    :color="selectedSituation.includes(t.ko) ? 'primary' : undefined"
                    @click="toggleSituation(t.ko)">{{ t.ko }}</v-chip>
            </div>
            <v-btn block color="primary" class="mt-2" @click="showFilterSheet = false">
                적용 ({{ filteredImages.length }}개)
            </v-btn>
        </v-sheet>
    </v-bottom-sheet>

    <AppSnackbars ref="appSnackbars" />
</template>

<script setup>
import { onMounted, ref, computed, watch } from "vue";
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { matchesSearch, matchesFacetFilters } from '@/utils/imageFilter';

const { width } = useDisplay();
const isMobileCustom = computed(() => width.value <= 1024);

const search = ref(null);
const images = ref([]);
const taxonomy = ref({ emotion: [], situation: [] });
const selectedEmotion = ref([]);
const selectedSituation = ref([]);
const favImageIdxs = ref([]);
const isShowFav = ref(false);
const appSnackbars = ref(null);
const excludeGif = ref(null);
const showFilterSheet = ref(false);

const route = useRoute();
const router = useRouter();
const searchQuery = ref(route.query.search || null);

const withLeadingSlash = (p) => (p && !p.startsWith('/') && !p.startsWith('http')) ? `/${p}` : p;

onMounted(async () => {
    const response = await fetch("/assets/data/data.json?v=" + new Date().getTime());
    const file = await response.json();

    images.value = file.map(img => ({
        ...img,
        file: withLeadingSlash(img.file),
        thumb: withLeadingSlash(img.thumb)
    }));

    const taxonomyResponse = await fetch("/assets/data/taxonomy.json?v=" + new Date().getTime());
    taxonomy.value = await taxonomyResponse.json();

    const favImageIdxsText = localStorage.getItem('favImageIdxs');
    favImageIdxs.value = favImageIdxsText ? favImageIdxsText?.split(',') : favImageIdxs.value;

    // 즐겨찾기 데이터 마이그레이션 및 유효성 검사
    if (favImageIdxs.value && Array.isArray(favImageIdxs.value) && favImageIdxs.value.length > 0) {
        const idToFile = {};
        const nameToFile = {};
        const fileSet = new Set();
        file.forEach(it => {
            if (it.file) fileSet.add(it.file);
            if (it.id && it.file) idToFile[String(it.id)] = it.file;
            if (it.name && it.file) nameToFile[it.name] = it.file;
        });

        const migrated = favImageIdxs.value.map(v => {
            if (fileSet.has(v)) return v;
            if (v.indexOf('/') === -1 && idToFile[v]) return idToFile[v];
            try {
                const filename = v.split('/').pop();
                if (filename) {
                    const name = filename.substring(0, filename.lastIndexOf('.'));
                    if (name && nameToFile[name]) {
                        return nameToFile[name];
                    }
                }
            } catch (e) {
                // ignore
            }
            return null;
        }).filter(Boolean);

        if (migrated.length !== favImageIdxs.value.length || migrated.some((v, i) => v !== favImageIdxs.value[i])) {
            favImageIdxs.value = migrated;
            localStorage.setItem('favImageIdxs', favImageIdxs.value.join(','));
            console.log('즐겨찾기 목록이 최신 파일 경로 기준으로 갱신되었습니다.');
        }
    }

    const stored = localStorage.getItem('excludeGif');
    excludeGif.value = stored ? stored === '1' : false;

    search.value = searchQuery.value;
});

watch(searchQuery, (newQuery) => {
    router.replace({
        query: { search: newQuery || undefined }
    });
});

watch(
    () => route.query.search,
    (newSearch) => {
        if (newSearch !== searchQuery.value) {
            searchQuery.value = newSearch || null;
            search.value = searchQuery.value;
        }
    }
);

watch(favImageIdxs, (newValue) => {
    newValue && Array.isArray(newValue) && localStorage.setItem('favImageIdxs', newValue.join(','));
})
watch(excludeGif, (newValue) => {
    localStorage.setItem('excludeGif', newValue ? '1' : '0');
})

const favImages = computed(() => {
    let filteredFav = images.value.filter(img => {
        return favImageIdxs.value.includes(img.file) ? img : null;
    })
    function sortImagesByFavKeys(imgs, favKeys) {
        return imgs.sort((a, b) => favKeys.indexOf(a.file) - favKeys.indexOf(b.file));
    }
    return sortImagesByFavKeys(filteredFav, favImageIdxs.value);
})

const filteredImages = computed(() => {
    let filtered = images.value.filter(img =>
        matchesFacetFilters(img, { emotion: selectedEmotion.value, situation: selectedSituation.value })
    );
    if (search.value) {
        filtered = filtered.filter(img => matchesSearch(img, search.value));
    }
    if (excludeGif.value) {
        filtered = filtered.filter(img => img.file.indexOf('gif') == -1);
    }
    return filtered;
})

const activeFilterCount = computed(() => selectedEmotion.value.length + selectedSituation.value.length);

const toggleEmotion = (tag) => {
    selectedEmotion.value = selectedEmotion.value.includes(tag)
        ? selectedEmotion.value.filter(t => t !== tag)
        : [...selectedEmotion.value, tag];
};
const toggleSituation = (tag) => {
    selectedSituation.value = selectedSituation.value.includes(tag)
        ? selectedSituation.value.filter(t => t !== tag)
        : [...selectedSituation.value, tag];
};
const clearFilters = () => {
    selectedEmotion.value = [];
    selectedSituation.value = [];
};

const addFavImage = (imageKey) => {
    const imgIdx = favImageIdxs.value && favImageIdxs.value.length > 0 ? favImageIdxs.value.indexOf(imageKey) : -1;
    if (imgIdx == -1) {
        favImageIdxs.value = [imageKey, ...favImageIdxs.value,];
    } else {
        const newFavIdxs = [...favImageIdxs.value];
        const [item] = newFavIdxs.splice(imgIdx, 1);
        newFavIdxs.unshift(item);
        favImageIdxs.value = [...newFavIdxs];
    }
}
const copyImageToClipboard = async (image) => {
    addFavImage(image.file);

    if (image.file.indexOf('gif') != -1) {
        appSnackbars.value.showSnackbar({
            message: `안내 : "${image.name}" 를 Save As 로 다운 받으세요!!  `, type: 'warning'
        })
        return;
    }

    function setCanvasImage(path, func) {
        const img = new Image
        const c = document.createElement('canvas')
        const ctx = c.getContext('2d')

        img.onload = function () {
            c.width = this.naturalWidth
            c.height = this.naturalHeight
            ctx.drawImage(this, 0, 0)
            c.toBlob(blob => {
                func(blob)
            }, 'image/png')
        }
        img.src = path
    }

    try {
        setCanvasImage(image.file, (imgBlob) => {
            navigator.clipboard.write(
                [new ClipboardItem({ 'image/png': imgBlob })]
            )
                .then(() => {
                    appSnackbars.value.showSnackbar({
                        message: `"${image.name}" 를 클립보드에 복사되었습니다.`
                    })
                })
                .catch((e) => { console.log(e) })
        })
    } catch (error) {
        console.error("이미지를 클립보드에 복사하는 중 오류 발생:", error);
    }
}

const downloadGIF = (image) => {
    const fullUrl = `${window.location.origin}/${image.file}`;
    const a = document.createElement('a');
    a.href = fullUrl;
    a.download = image.file.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    appSnackbars.value.showSnackbar({
        message: `"${image.name}" 를 다운로드 합니다.`
    })
};

const deleteFromFav = (event, image) => {
    event.stopPropagation();
    favImageIdxs.value = favImageIdxs.value.filter((idx) => idx != image.file)
}
</script>

<style scoped>
.image-container {
    position: relative;
    display: flex;
    overflow: hidden;
}

.chip-row-label {
    font-size: 0.7em;
    color: #888;
    text-transform: uppercase;
    letter-spacing: .04em;
    margin: 4px 0 2px 8px;
}

.hover-text {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    text-align: center;
    padding: 5px;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
    font-size: 0.5em;
}

.delete {
    position: absolute;
    top: 0;
    right: 0;
    background-color: rgba(255, 0, 0, 0.6);
    color: white;
    text-align: center;
    font-weight: bold;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
    border-radius: 50%;
    width: 25px;
    height: 25px;
    cursor: pointer;
}

.image-container:hover .delete,
.image-container:hover .hover-text {
    opacity: 1;
}
</style>
```

- [ ] **Step 2: 개발 서버 기동**

Run: `yarn dev`
Expected: 콘솔에 에러 없이 `Local: http://localhost:3000/` 출력

- [ ] **Step 3: 수동 검증 (브라우저)**

`http://localhost:3000`을 열고 아래를 확인한다:
1. PC 폭(1024px 초과)에서 검색창 아래 "감정" 칩 줄과 "상황" 칩 줄이 사이드바 없이 바로 보인다.
2. "웃김" 칩 클릭 → 칩이 강조색으로 바뀌고 그리드가 필터링된다. 다시 클릭하면 해제된다.
3. "웃김"(감정) + "거절/부정"(상황)을 동시에 선택 → 두 조건을 모두 만족하는 이미지만 남는다(AND).
4. 브라우저 창을 1024px 이하로 줄이면(또는 개발자도구 반응형 모드) 칩바가 사라지고 검색창 옆에 "필터" 버튼이 뱃지(선택 개수)와 함께 보인다.
5. "필터" 버튼 클릭 → 바텀시트가 올라오고 감정/상황 칩이 모두 보인다. 칩 선택 시 뒤 그리드의 개수도 즉시 바뀐다.
6. 검색창에 "웃김"을 입력 → 감정 태그로 "웃김"이 붙은 이미지가 검색된다(칩을 선택하지 않아도).
7. "GIF 제외" 스위치가 정상 동작한다.
8. "최근" 탭으로 전환하면 감정/상황 칩 필터와 무관하게 즐겨찾기 목록이 그대로 보인다.
9. 브라우저 콘솔에 에러가 없다.

Expected: 위 9개 항목 모두 통과

- [ ] **Step 4: 커밋**

```bash
git add src/components/AppContent.vue
git commit -m "feat(ui): replace file-type sidebar with emotion/situation chip filters"
```

---

## Task 9: 빌드 검증

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 테스트 실행**

Run: `yarn test`
Expected: 모든 Vitest 테스트 PASS

- [ ] **Step 2: 프로덕션 빌드**

Run: `yarn build`
Expected: exit code 0, `dist/` 생성, 에러 없음

- [ ] **Step 3: 빌드 산출물 검증**

```bash
ls dist/assets/data/taxonomy.json
ls dist/assets/thumbs/ | wc -l
node -e "
const data = require('./dist/assets/data/data.json');
console.log('총 항목:', data.length);
const sample = data.find(d => d.name === '흡족');
console.log('신규 항목 emotion:', sample.emotion, 'situation:', sample.situation, 'thumb:', sample.thumb);
"
```
Expected: `taxonomy.json` 존재, thumbs 11개 이상, `총 항목: 321`, `흡족` 항목의 emotion/situation/thumb 필드가 채워져 있음

- [ ] **Step 4: 로컬 프리뷰로 최종 확인**

Run: `yarn preview`
브라우저에서 `http://localhost:4173`(또는 출력된 포트)를 열어 Task 8의 9개 체크리스트를 다시 한 번 프로덕션 빌드 기준으로 확인한다.

Expected: 개발 서버와 동일하게 동작

---

## Task 10: 배포 (Amplify) — 사용자 확인 필수 체크포인트

이 태스크는 실제 원격 저장소에 push하고 프로덕션 배포를 트리거하는, 되돌리기 번거로운 작업이다. **아래 확인 없이 push하지 않는다.**

- [ ] **Step 1: Amplify 빌드 트리거 브랜치 확인**

사용자에게 AWS Amplify 콘솔(Hosting → 앱 선택 → Branches)에서 현재 연결된 브랜치가 `jjal_kabkee`인지 `main`인지 확인받는다. (레포의 `main`은 "init" 커밋만 있고, 실제 작업은 전부 `jjal_kabkee`에서 이루어져 왔다는 점을 참고용으로 전달한다.)

- [ ] **Step 2: 최종 diff 리뷰**

Run: `git log --oneline main..jjal_kabkee` 와 `git status`로 이번 플랜에서 만든 커밋 목록을 사용자에게 보여주고 push 승인을 받는다.

- [ ] **Step 3: Push**

확인된 브랜치로 push한다 (예: `jjal_kabkee`가 트리거라면):
```bash
git push origin jjal_kabkee
```
`main`이 트리거라면, 먼저 병합 방식(fast-forward/PR)을 사용자와 정하고 나서 진행한다 — 이 플랜은 그 경우의 정확한 명령어를 규정하지 않는다(사용자 결정 필요).

- [ ] **Step 4: Amplify 빌드 확인 및 엔드포인트 전달**

Amplify 콘솔에서 빌드 상태(Provision → Build → Deploy → Verify)가 모두 성공했는지 확인하고, 배포된 도메인 URL을 사용자에게 전달한다. 빌드 실패 시 Amplify 빌드 로그를 확인해 원인을 파악한다(예: `yarn convert` 단계에서 `sharp`/`vitest`가 devDependencies에만 있어 Amplify의 프로덕션 전용 설치 설정과 충돌하지 않는지 특히 확인 — 충돌 시 Amplify 빌드 설정의 `npm install` 단계가 `--production` 플래그를 쓰는지 점검).

---

## Self-Review 메모 (작성자 기록용)

- **스펙 커버리지**: 데이터 스키마(Task 3,5,6,7), 태그 정책(Task 3,6), 태깅 워크플로우(Task 5,6), UI/필터(Task 8), 인코딩 안전장치(Task 1,2,5,6 — normalize 적용 지점 전부 커버), 이미지 최적화(Task 4,5,6), 배포(Task 10) 모두 태스크로 커버됨.
- **타입/시그니처 일관성**: `matchesFacetFilters(image, { emotion, situation })`와 `buildRecord({..., emotion, situation})`이 모두 배열을 기대하며 일치. `taxonomy.json`의 `{ ko, en[] }` 구조를 `AppContent.vue`(칩 렌더링 시 `t.ko` 사용)와 태깅 매니페스트(값은 `ko` 문자열만 사용) 양쪽에서 동일하게 취급함을 확인.
- **범위 밖 명시**: 기존 310개 소급 태깅, 전면 데이터 품질 감사는 이 플랜에 포함하지 않음(스펙과 동일하게 유지).
