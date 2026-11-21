const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateThumbnail } = require('./generate-thumbnail');
const { convertToWebp, isAnimated, md5File } = require('./webp-convert');
const sharp = require('sharp');

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

// 'YYYY-MM-DD' (로컬 날짜). '최근 추가' 판단용 — id는 옛 데이터 중복 정리로 재번호된 게 있어 순서를 믿을 수 없다.
const today = () => new Date().toLocaleDateString('sv-SE');

function buildRecord({ id, uuid, ext, folder, name, emotion, situation, tag, added = today(), md5, animated }) {
    const normalize = (s) => (s || '').normalize('NFC');
    const extra = {};
    if (md5) extra.md5 = md5;
    if (animated) extra.animated = true;
    return {
        id: String(id),
        name: normalize(name),
        file: `assets/${folder}/${uuid}${ext}`,
        thumb: `assets/thumbs/${uuid}.webp`,
        emotion: (emotion || []).map(normalize),
        situation: (situation || []).map(normalize),
        tag: normalize(tag),
        added,
        ...extra
    };
}

function getGlobalNextId(sourcesDir) {
    let max = 0;
    for (const config of Object.values(EXT_MAP)) {
        const jsonPath = path.join(sourcesDir, config.json);
        if (!fs.existsSync(jsonPath)) continue;
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        max = Math.max(max, data.reduce((m, item) => {
            const id = parseInt(item.id, 10);
            return isNaN(id) ? m : Math.max(m, id);
        }, 0));
    }
    return max + 1;
}

// 파일 하나를 UUID 이름으로 저장하고 썸네일을 만든 뒤 sources/<원본형식>.json 에 레코드를 추가한다.
//  - 정지 이미지 → webp 로 변환해 assets/webp/ (2026-11-21)
//  - 움짤 → GIF 로 assets/gif/ (2026-11-21 오너 결정: 카톡은 움직이는 webp 를 작게 보여줘서 움짤은 GIF 를 서빙).
//    원본이 GIF 면 다시 인코딩하지 않고 그대로, 움직이는 webp·png 면 GIF 로 변환한다.
// 원본(srcPath)은 처리 후 지워진다. md5 는 원본 기준(중복 업로드 감지용).
async function importOne({ srcPath, name, emotion, situation, tag }, { sourcesDir = SOURCES_DIR } = {}) {
    const ext = path.extname(srcPath).toLowerCase();
    const config = EXT_MAP[ext];
    if (!config) throw new Error(`지원하지 않는 확장자: ${path.basename(srcPath)}`);
    if (!fs.existsSync(srcPath)) throw new Error(`파일을 찾을 수 없음: ${srcPath}`);

    const uuid = crypto.randomUUID();
    const animated = await isAnimated(srcPath);
    const outExt = animated ? '.gif' : '.webp';
    const outFolder = animated ? 'gif' : 'webp';
    const targetDir = path.join(ASSETS_DIR, outFolder);
    fs.mkdirSync(targetDir, { recursive: true });
    const destPath = path.join(targetDir, `${uuid}${outExt}`);
    let converted;
    if (!animated) {
        converted = await convertToWebp(srcPath, destPath);
    } else {
        if (ext === '.gif') fs.copyFileSync(srcPath, destPath);
        else await sharp(srcPath, { animated: true, limitInputPixels: false }).gif().toFile(destPath);
        converted = { animated: true, md5: md5File(srcPath) };
    }

    fs.mkdirSync(THUMBS_DIR, { recursive: true });
    await generateThumbnail(srcPath, path.join(THUMBS_DIR, `${uuid}.webp`));
    fs.unlinkSync(srcPath);

    // id 는 파일 이동·썸네일 생성이 끝난 직후에 채번해서, 그 사이 다른 등록과 겹치지 않게 한다.
    const jsonPath = path.join(sourcesDir, config.json);
    const jsonData = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : [];
    const record = buildRecord({
        id: getGlobalNextId(sourcesDir), uuid, ext: outExt, folder: outFolder,
        name, emotion, situation, tag, md5: converted.md5, animated: converted.animated
    });
    jsonData.push(record);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 4), 'utf8');
    return record;
}

async function importAll() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error(`Manifest not found: ${MANIFEST_PATH}`);
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

    for (const entry of manifest) {
        const ext = path.extname(entry.sourceFilename).toLowerCase();
        if (!EXT_MAP[ext]) {
            console.warn(`⚠️ 지원하지 않는 확장자, 건너뜀: ${entry.sourceFilename}`);
            continue;
        }
        const srcPath = path.join(NEW_DIR, entry.sourceFilename);
        if (!fs.existsSync(srcPath)) {
            console.warn(`⚠️ 파일을 찾을 수 없음, 건너뜀: ${srcPath}`);
            continue;
        }
        const record = await importOne({
            srcPath, name: entry.name, emotion: entry.emotion, situation: entry.situation, tag: entry.tag
        });
        console.log(`✅ ${entry.sourceFilename} -> ${record.file}`);
    }

    fs.writeFileSync(MANIFEST_PATH, '[]', 'utf8');
    console.log('모든 이미지 반영 완료. `yarn generate:data`로 data.json을 재생성하세요.');
}

module.exports = { buildRecord, getGlobalNextId, importOne, EXT_MAP };

if (require.main === module) {
    importAll().catch(err => { console.error(err); process.exit(1); });
}
