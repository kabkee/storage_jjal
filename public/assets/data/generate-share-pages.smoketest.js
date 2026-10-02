const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSharePage, generateSharePages } = require('./generate-share-pages');

const SITE = 'https://example.test';

// 짤 이미지가 og:image 로, 이름이 og:title 로 들어가고 SPA 로 넘어간다
const html = buildSharePage({ id: '311', name: '카드 결제', file: 'assets/jpg/abc.jpg' }, SITE);
assert.ok(html.includes('<meta property="og:image" content="https://example.test/assets/jpg/abc.jpg" />'), 'og:image missing');
assert.ok(html.includes('<meta property="og:title" content="카드 결제" />'), 'og:title missing');
assert.ok(html.includes('url=/?ids=311'), 'redirect missing');
assert.ok(!html.includes('#'), 'no hash links: KakaoTalk skips previews for URLs with #');

// 앞에 / 가 붙은 file 도 // 없이 이어 붙인다
assert.ok(buildSharePage({ id: '1', name: 'x', file: '/assets/gif/a.gif' }, SITE)
    .includes('content="https://example.test/assets/gif/a.gif"'), 'leading slash not handled');

// 이름에 HTML 특수문자가 있어도 태그가 깨지지 않는다
const evil = buildSharePage({ id: '2', name: '"><script>x</script>', file: 'assets/jpg/b.jpg' }, SITE);
assert.ok(!evil.includes('<script>x</script>'), 'name not escaped');

// id 가 숫자가 아니거나 file 이 없으면 만들지 않는다 (경로 조작 방지)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'share-pages-'));
const count = generateSharePages([
    { id: '10', name: 'ok', file: 'assets/jpg/c.jpg' },
    { id: '../evil', name: 'bad', file: 'assets/jpg/d.jpg' },
    { id: '11', name: 'nofile' }
], tmp);
assert.strictEqual(count, 1, `expected 1 page, got ${count}`);
assert.deepStrictEqual(fs.readdirSync(tmp), ['10.html']);
fs.rmSync(tmp, { recursive: true, force: true });

// 중복 id 가 있으면 페이지를 덮어쓰지 말고 실패해야 한다
assert.throws(() => generateSharePages([
    { id: '7', name: 'a', file: 'assets/jpg/a.jpg' },
    { id: '7', name: 'b', file: 'assets/jpg/b.jpg' }
], fs.mkdtempSync(path.join(os.tmpdir(), 'share-pages-dup-'))), /중복 id: 7/);

console.log('✅ generate-share-pages smoke test passed');
