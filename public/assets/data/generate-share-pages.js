// 짤 1개 공유용 정적 페이지 생성: dist/s/<id>.html
// 미리보기 봇은 #뒤를 못 읽고 JS도 실행하지 않으므로, 짤마다 OG 태그가 박힌 HTML을 빌드 때 만들어 둔다.
// 사람이 열면 바로 SPA(/?ids=<id>)로 넘어간다.
// 주의: Amplify 재작성 규칙의 예외 확장자에 html 이 있어야 이 파일이 index.html 로 덮이지 않는다.
const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://jjal-kabkee.d271z96h7lorpb.amplifyapp.com';
const SITE_NAME = '값기의 짤방 모음';
const DATA_PATH = path.join(__dirname, 'data.json');
const OUT_DIR = path.join(__dirname, '../../../dist/s');

const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function buildSharePage(img, siteUrl = SITE_URL) {
    const id = String(img.id);
    const name = escapeHtml((img.name || SITE_NAME).normalize('NFC'));
    const imageUrl = `${siteUrl}/${String(img.file).replace(/^\//, '')}`;
    const pageUrl = `${siteUrl}/s/${id}.html`;
    const appUrl = `/?ids=${id}`;
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${name} | ${SITE_NAME}</title>
<meta name="robots" content="noindex" />
<link rel="canonical" href="${pageUrl}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${name}" />
<meta property="og:description" content="${SITE_NAME}에서 공유한 짤" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:image" content="${escapeHtml(imageUrl)}" />
<meta property="og:locale" content="ko_KR" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${name}" />
<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
<meta http-equiv="refresh" content="0; url=${appUrl}" />
<script>location.replace(${JSON.stringify(appUrl)});</script>
</head>
<body><a href="${appUrl}">${name} 보러 가기</a></body>
</html>
`;
}

function generateSharePages(images, outDir = OUT_DIR) {
    // id가 겹치면 /s/<id>.html 이 서로 덮어써 엉뚱한 짤이 미리보기에 뜬다 → 빌드를 멈춘다
    const seen = new Set();
    const dups = new Set(images.map(img => String(img.id)).filter(id => seen.has(id) || !seen.add(id)));
    if (dups.size) throw new Error(`중복 id: ${[...dups].join(', ')} — sources/*.json 의 id를 고유하게 고치세요`);
    fs.mkdirSync(outDir, { recursive: true });
    let count = 0;
    for (const img of images) {
        if (!/^\d+$/.test(String(img.id)) || !img.file) continue;
        fs.writeFileSync(path.join(outDir, `${img.id}.html`), buildSharePage(img));
        count++;
    }
    return count;
}

if (require.main === module) {
    const images = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const count = generateSharePages(images);
    console.log(`✅ 공유 페이지 ${count}개 생성: dist/s/<id>.html`);
}

module.exports = { buildSharePage, generateSharePages };
