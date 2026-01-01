const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data.json');
const SOURCES_DIR = path.join(__dirname, 'sources');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const isArray = (v) => Array.isArray(v);

function loadSourceFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.json'));
    return files.map(f => ({ filename: f, full: path.join(dir, f) }));
}

function mergeItemsFromSources(files) {
    const all = [];
    for (const f of files) {
        try {
            const data = readJson(f.full);
            if (!isArray(data)) {
                console.warn(`⚠️ ${f.filename} 는 배열이 아닙니다. 스킵`);
                continue;
            }
            for (const it of data) {
                // 최소 필드 보정: file 필수 검사
                const item = { ...it };
                // if ('id' in item) delete item.id; // 앱에서 ID 기반 마이그레이션을 위해 ID 유지
                if (!item.file || typeof item.file !== 'string') {
                    console.warn(`⚠️ ${f.filename} 항목에 file 이 없습니다. 스킵`);
                    continue;
                }
                all.push(item);
            }
        } catch (e) {
            console.warn(`⚠️ ${f.filename} 파싱 오류:`, e.message);
        }
    }
    return all;
}

function ensureUniqueFiles(items) {
    const seen = new Set();
    const result = [];
    for (const it of items) {
        const key = it.file;
        if (!key) continue;
        if (seen.has(key)) {
            console.warn(`⚠️ 중복 file 감지: ${key} (이전 항목 보존, 이후 항목 무시)`);
            continue;
        }
        seen.add(key);
        result.push(it);
    }
    return result;
}

(function main() {
    const sources = loadSourceFiles(SOURCES_DIR);
    if (sources.length === 0) {
        console.log('ℹ️ sources 디렉터리가 없거나 비어있습니다. 병합을 스킵하고 기존 data.json 을 유지합니다.');
        process.exit(0);
    }

    const merged = mergeItemsFromSources(sources);
    const unique = ensureUniqueFiles(merged);

    // 안정적 정렬: 파일 경로 기준 오름차순(한글 정렬 고려)
    unique.sort((a, b) => String(a.file).localeCompare(String(b.file), 'ko'));

    fs.writeFileSync(DATA_PATH, JSON.stringify(unique, null, 4), 'utf8');
    console.log(`✅ data.json 생성 완료: ${unique.length}개 항목`);
})();
