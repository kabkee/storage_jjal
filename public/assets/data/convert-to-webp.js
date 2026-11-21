// 일회성 마이그레이션: sources/{gif,jpg,png}.json 의 원본 파일을 전부 webp 로 바꾼다 (2026-11-21).
//   node public/assets/data/convert-to-webp.js            → 미리보기(dry-run): 변환만 /tmp 에 해보고 용량 집계
//   node public/assets/data/convert-to-webp.js --apply    → assets/webp/<uuid>.webp 생성 + sources 갱신 + 원본 삭제
// 레코드는 원래 있던 sources/<원본형식>.json 에 그대로 두고 file 만 바꾼다. 추가 필드:
//   md5      원본 파일 md5 (관리 화면 「이미 등록된 짤」 감지가 원본 기준으로 계속 동작하도록)
//   animated 움직이는 짤이면 true (사이트의 GIF 배지·GIF 제외 필터가 이걸 본다)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { convertToWebp } = require('./webp-convert');

const APPLY = process.argv.includes('--apply');
const PUBLIC_DIR = path.join(__dirname, '../..');
const SOURCES_DIR = path.join(__dirname, 'sources');
const WEBP_DIR = path.join(PUBLIC_DIR, 'assets/webp');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jjal-webp-'));
const CONCURRENCY = Math.max(2, Math.min(8, os.cpus().length - 2));

async function pool(items, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

(async () => {
    fs.mkdirSync(WEBP_DIR, { recursive: true });
    const stats = {};
    const failures = [];
    for (const type of ['gif', 'jpg', 'png']) {
        const jsonPath = path.join(SOURCES_DIR, `${type}.json`);
        const records = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const todo = records.filter(r => r.file && !/\.webp$/i.test(r.file));
        const s = stats[type] = { count: 0, src: 0, webp: 0, animated: 0, bigger: 0, converted: [] };
        await pool(todo, CONCURRENCY, async (rec) => {
            const src = path.join(PUBLIC_DIR, rec.file);
            if (!fs.existsSync(src)) { failures.push(`${rec.id}: 원본 없음 ${rec.file}`); return; }
            const uuid = path.basename(rec.file).replace(/\.[^.]+$/, '');
            const dest = APPLY ? path.join(WEBP_DIR, `${uuid}.webp`) : path.join(TMP_DIR, `${uuid}.webp`);
            try {
                const r = await convertToWebp(src, dest);
                s.count++; s.src += r.srcBytes; s.webp += r.webpBytes;
                if (r.animated) s.animated++;
                if (r.webpBytes > r.srcBytes) s.bigger++;
                if (APPLY) {
                    rec.file = `assets/webp/${uuid}.webp`;
                    rec.md5 = r.md5;
                    if (r.animated) rec.animated = true; else delete rec.animated;
                    s.converted.push(src);
                }
            } catch (e) {
                failures.push(`${rec.id}: ${rec.file} → ${e.message}`);
                if (APPLY && fs.existsSync(dest)) fs.unlinkSync(dest);
            }
        });
        if (APPLY) {
            // sources 를 먼저 저장한 뒤, webp 로 바뀐 레코드의 원본만 지운다 (실패한 건 원본 유지)
            fs.writeFileSync(jsonPath, JSON.stringify(records, null, 4), 'utf8');
            for (const src of s.converted) if (fs.existsSync(src)) fs.unlinkSync(src);
        }
    }
    const MB = (b) => (b / 1e6).toFixed(1) + 'MB';
    let tSrc = 0, tWebp = 0;
    for (const [type, s] of Object.entries(stats)) {
        tSrc += s.src; tWebp += s.webp;
        console.log(`${type.padEnd(4)} ${String(s.count).padStart(3)}개  ${MB(s.src).padStart(8)} → ${MB(s.webp).padStart(7)} (${Math.round(s.webp * 100 / (s.src || 1))}%)  움직임 ${s.animated}  원본보다 큼 ${s.bigger}`);
    }
    console.log(`합계        ${MB(tSrc).padStart(8)} → ${MB(tWebp).padStart(7)} (${Math.round(tWebp * 100 / (tSrc || 1))}%)`);
    if (failures.length) { console.log(`❌ 실패 ${failures.length}건\n  ` + failures.join('\n  ')); process.exitCode = 1; }
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    console.log(APPLY ? '✅ 적용 완료 (변환된 원본은 삭제됨 — git 기록에는 남아 있음)' : 'ℹ️ 미리보기만 함. 적용하려면 --apply');
})();
