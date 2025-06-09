const fs = require('fs');
const path = require('path');

// 대상 디렉토리들
const targetDirs = [
    path.join(__dirname, '../gif'),
    path.join(__dirname, '../jpg'),
    path.join(__dirname, '../png'),
    path.join(__dirname, '../webp')
];

// NFC 변환 함수 (객체용)
const normalizeToNFC = (obj) => {
    if (typeof obj === 'string') return obj.normalize('NFC');
    if (Array.isArray(obj)) return obj.map(normalizeToNFC);
    if (typeof obj === 'object' && obj !== null) {
        return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.normalize('NFC'), normalizeToNFC(v)]));
    }
    return obj;
};

// 파일 순회 및 처리
const normalizeFilesInDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) return;

    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const oldPath = path.join(dirPath, file);
        const stat = fs.statSync(oldPath);
        if (!stat.isFile()) return;

        const normalizedFileName = file.normalize('NFC');
        const newPath = path.join(dirPath, normalizedFileName);

        // 파일 이름이 다르면 rename
        if (oldPath !== newPath) {
            fs.renameSync(oldPath, newPath);
            console.log(`파일명 정규화됨: ${file} -> ${normalizedFileName}`);
        }

        // JSON 파일이면 내용도 정규화
        if (normalizedFileName.endsWith('.json')) {
            const rawData = fs.readFileSync(newPath, 'utf8');
            try {
                const jsonData = JSON.parse(rawData);
                const normalizedData = normalizeToNFC(jsonData);
                fs.writeFileSync(newPath, JSON.stringify(normalizedData, null, 4), 'utf8');
                console.log(`내용 정규화됨: ${normalizedFileName}`);
            } catch (e) {
                console.warn(`⚠️ JSON 파싱 오류 (무시됨): ${normalizedFileName}`);
            }
        }
    });
};

// 실행
targetDirs.forEach(normalizeFilesInDir);
console.log('✅ 모든 파일명 및 JSON 내용이 NFC로 정규화되었습니다.');