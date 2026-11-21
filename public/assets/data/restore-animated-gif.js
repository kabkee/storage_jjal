// 일회성 마이그레이션 (2026-11-21): 움짤만 webp → 「원본 GIF」 로 되돌린다.
// 카톡은 움직이는 webp 를 작게 보여주고 GIF 는 크게 보여줘서(오너 확인) 움짤은 원본 GIF 를 서빙한다. 정지 짤·썸네일은 webp 그대로.
// 원본은 webp 전환 직전 커밋(e9a565f)의 git 기록에서 꺼낸다 — 다시 인코딩하지 않으므로 화질 손실 없음.
//   node public/assets/data/restore-animated-gif.js            → 미리보기(무엇을 바꿀지 + 용량)
//   node public/assets/data/restore-animated-gif.js --apply    → assets/gif/<uuid>.gif 생성 + sources 갱신 + 움짤 webp 삭제
// 파일 이름은 지금 webp 와 같은 UUID 를 쓴다(옛 이름 중 yes.gif 같은 비 UUID 이름 30개도 UUID 로 통일).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const APPLY = process.argv.includes('--apply');
const BEFORE_WEBP = 'e9a565f';
const PUBLIC_DIR = path.join(__dirname, '../..');
const SOURCES_DIR = path.join(__dirname, 'sources');
const REPO = path.join(PUBLIC_DIR, '..');
const git = (...args) => execFileSync('git', args, { cwd: REPO, maxBuffer: 1 << 30 });

const oldFile = {};
for (const t of ['gif', 'jpg', 'png', 'webp']) {
    let text;
    try { text = git('show', `${BEFORE_WEBP}:public/assets/data/sources/${t}.json`).toString(); } catch { continue; }
    for (const r of JSON.parse(text)) oldFile[r.id] = r.file;
}

let count = 0, webpBytes = 0, gifBytes = 0;
const problems = [];
for (const t of ['gif', 'jpg', 'png', 'webp']) {
    const jsonPath = path.join(SOURCES_DIR, `${t}.json`);
    if (!fs.existsSync(jsonPath)) continue;
    const records = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let changed = false;
    for (const r of records) {
        if (!r.animated || !r.file.endsWith('.webp')) continue;
        const src = oldFile[r.id];
        if (!src || !src.toLowerCase().endsWith('.gif')) { problems.push(`${r.id}: 원본 GIF 없음 (${src})`); continue; }
        const bytes = git('show', `${BEFORE_WEBP}:public/${src}`);
        const md5 = crypto.createHash('md5').update(bytes).digest('hex');
        if (r.md5 && r.md5 !== md5) { problems.push(`${r.id}: md5 불일치`); continue; }
        const uuid = path.basename(r.file, '.webp');
        const dest = `assets/gif/${uuid}.gif`;
        webpBytes += fs.statSync(path.join(PUBLIC_DIR, r.file)).size;
        gifBytes += bytes.length;
        count++;
        if (APPLY) {
            fs.mkdirSync(path.join(PUBLIC_DIR, 'assets/gif'), { recursive: true });
            fs.writeFileSync(path.join(PUBLIC_DIR, dest), bytes);
            fs.unlinkSync(path.join(PUBLIC_DIR, r.file));
            r.file = dest;
            changed = true;
        }
    }
    if (changed) fs.writeFileSync(jsonPath, JSON.stringify(records, null, 4), 'utf8');
}
const mb = (n) => (n / 1e6).toFixed(1) + 'MB';
console.log(`${APPLY ? '✅ 되돌림' : '미리보기'}: 움짤 ${count}개 · webp ${mb(webpBytes)} → 원본 GIF ${mb(gifBytes)}`);
if (problems.length) { console.log('⚠️ 문제:\n' + problems.join('\n')); process.exitCode = 1; }
