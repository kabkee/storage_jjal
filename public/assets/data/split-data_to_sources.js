const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data.json');
const SOURCES_DIR = path.join(__dirname, 'sources');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadDataJson() {
    if (!fs.existsSync(DATA_PATH)) {
        console.error('❌ data.json 이 존재하지 않습니다.');
        process.exit(1);
    }
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
}

function groupByExt(items) {
    const groups = {};
    for (const it of items) {
        const file = (it.file || '').toLowerCase();
        let ext = path.extname(file); // includes dot
        if (ext === '.jpeg') ext = '.jpg';
        const key = ext.startsWith('.') && ext.length > 1 ? ext.substring(1) : 'others';
        if (!groups[key]) groups[key] = [];
        groups[key].push(it);
    }
    return groups;
}

(function main() {
    const data = loadDataJson();
    if (!Array.isArray(data)) {
        console.error('❌ data.json 의 최상위 구조가 배열이 아닙니다.');
        process.exit(1);
    }

    ensureDir(SOURCES_DIR);
    const groups = groupByExt(data);

    Object.entries(groups).forEach(([key, arr]) => {
        const outPath = path.join(SOURCES_DIR, `${key}.json`);
        fs.writeFileSync(outPath, JSON.stringify(arr, null, 4), 'utf8');
        console.log(`✂️  ${key}.json 으로 ${arr.length}개 항목 저장`);
    });

    console.log('✅ 분리 완료. 이후 변경은 sources/*.json 에서 관리하세요.');
})();
