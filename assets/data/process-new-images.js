
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 환경 변수에서 API 키 로드
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable is not set.");
    console.error("Please create a .env file in the root directory with GEMINI_API_KEY=your_api_key");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const modelFlash = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const modelLite = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

// 경로 설정
const NEW_IMAGES_DIR = path.join(__dirname, '../new');
const ASSETS_DIR = path.join(__dirname, '../../assets'); // public/assets
const DATA_SOURCES_DIR = path.join(__dirname, 'sources');

// 지원하는 확장자와 매핑되는 JSON 파일 및 폴더
const EXT_MAP = {
    '.jpg': { folder: 'jpg', json: 'jpg.json', type: 'JPG' },
    '.jpeg': { folder: 'jpg', json: 'jpg.json', type: 'JPG' },
    '.png': { folder: 'png', json: 'png.json', type: 'PNG' },
    '.gif': { folder: 'gif', json: 'gif.json', type: 'GIF' },
    '.webp': { folder: 'webp', json: 'webp.json', type: 'WEBP' },
};

// 딜레이 함수 (Rate Limit 대응)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 이미지 파일을 Base64로 읽기
function fileToGenerativePart(filePath, mimeType) {
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
            mimeType
        },
    };
}

function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/jpeg';
}

// 다음 ID 생성 (Max ID + 1)
function getNextId(data) {
    if (!data || data.length === 0) return 1;
    const maxId = data.reduce((max, item) => {
        const id = parseInt(item.id, 10);
        return isNaN(id) ? max : Math.max(max, id);
    }, 0);
    return maxId + 1;
}

async function analyzeAndMove() {
    // 1. 신규 이미지 목록 읽기
    if (!fs.existsSync(NEW_IMAGES_DIR)) {
        console.error(`Directory not found: ${NEW_IMAGES_DIR}`);
        return;
    }

    const files = fs.readdirSync(NEW_IMAGES_DIR).filter(file => {
        const ext = path.extname(file).toLowerCase();
        return EXT_MAP[ext] !== undefined;
    });

    if (files.length === 0) {
        console.log("No new images found in 'public/assets/new'.");
        return;
    }

    console.log(`Found ${files.length} new images.`);

    for (let i = 0; i < files.length; i++) {
        const filename = files[i];
        const filePath = path.join(NEW_IMAGES_DIR, filename);
        const ext = path.extname(filename).toLowerCase();
        const config = EXT_MAP[ext];

        console.log(`[${i + 1}/${files.length}] Processing: ${filename}`);

        try {
            // 2. Gemini 이미지 분석
            const mimeType = getMimeType(filePath);
            const imagePart = fileToGenerativePart(filePath, mimeType);
            const prompt = "Analyze this image and provide 5-10 relevant tags in Korean and English, separated by commas. Focus on visible text, emotions, actions, objects, and famous memes. Just list the tags.";

            // GIF는 Flash 모델, 나머지는 Lite 모델 사용
            const targetModel = mimeType === 'image/gif' ? modelFlash : modelLite;
            const result = await targetModel.generateContent([prompt, imagePart]);
            
            const response = await result.response;
            const text = response.text();
            const tags = text.replace(/\n/g, ',').split(',').map(t => t.trim()).filter(t => t.length > 0).join(', ');

            console.log(`    -> Tags: ${tags.substring(0, 50)}...`);

            // 3. 파일 이동
            const targetDir = path.join(ASSETS_DIR, config.folder);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // UUID로 안전한 파일명 생성
            const ext = path.extname(filename);
            const newFileName = `${crypto.randomUUID()}${ext}`;
            const uniquePath = path.join(targetDir, newFileName);
            
            fs.renameSync(filePath, uniquePath);
            const relativePath = `assets/${config.folder}/${newFileName}`; // DB에 저장될 경로

            console.log(`    -> Moved to: ${relativePath}`);

            // 4. JSON 업데이트
            const jsonPath = path.join(DATA_SOURCES_DIR, config.json);
            let jsonData = [];
            if (fs.existsSync(jsonPath)) {
                jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            }

            const newId = getNextId(jsonData);
            const name = path.basename(filename, ext); // 확장자 제외한 파일명을 이름으로 사용

            const newItem = {
                id: String(newId),
                name: name,
                file: relativePath,
                tag: tags,
                category_1: config.type,
                category_2: null
            };

            jsonData.push(newItem);
            fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 4), 'utf8');
            console.log(`    -> Added to ${config.json} (ID: ${newId})`);

            // Rate Limit 대기
            await delay(4000);

        } catch (error) {
            console.error(`    -> Error processing ${filename}:`, error.message);
            await delay(5000);
        }
    }
    
    console.log("All done.");
}

analyzeAndMove().catch(console.error);
