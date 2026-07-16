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

async function importAll() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error(`Manifest not found: ${MANIFEST_PATH}`);
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    let nextId = getGlobalNextId(SOURCES_DIR);

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
            id: nextId++, uuid, ext, folder: config.folder,
            name: entry.name, emotion: entry.emotion, situation: entry.situation, tag: entry.tag
        });
        jsonData.push(record);
        fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 4), 'utf8');

        console.log(`✅ ${entry.sourceFilename} -> ${record.file}`);
    }

    fs.writeFileSync(MANIFEST_PATH, '[]', 'utf8');
    console.log('모든 이미지 반영 완료. `yarn generate:data`로 data.json을 재생성하세요.');
}

module.exports = { buildRecord, getGlobalNextId };

if (require.main === module) {
    importAll().catch(err => { console.error(err); process.exit(1); });
}
