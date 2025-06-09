const fs = require('fs');

// JSON 파일 경로
const filePath = `${__dirname}/data.json`;

// JSON 파일 읽기
const rawData = fs.readFileSync(filePath, 'utf8');
const jsonData = JSON.parse(rawData);

// NFC 변환 함수
const normalizeToNFC = (obj) => {
    if (typeof obj === 'string') {
        return obj.normalize('NFC');
    }
    if (Array.isArray(obj)) {
        return obj.map(normalizeToNFC);
    }
    if (typeof obj === 'object' && obj !== null) {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, normalizeToNFC(value)])
        );
    }
    return obj;
};

// 변환된 데이터 저장
const normalizedData = normalizeToNFC(jsonData);
fs.writeFileSync(filePath, JSON.stringify(normalizedData, null, 4), 'utf8');

console.log('JSON 파일이 NFC로 변환되었습니다.');