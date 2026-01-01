
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// API 키 확인
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable is not set.");
    console.error("Please create a .env file in the root directory with GEMINI_API_KEY=your_api_key");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const modelFlash = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const modelLite = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

const SOURCES_DIR = path.join(__dirname, 'sources');
const ROOT_DIR = path.resolve(__dirname, '../../..'); // 프로젝트 루트 (package.json이 있는 곳)

// 처리할 파일 목록
const TARGET_FILES = ['gif.json', 'jpg.json', 'png.json', 'webp.json'];

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

// MIME 타입 추론
function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif'; // Gemini 1.5 Flash supports GIF
    return 'image/jpeg';
}

async function processImages() {
    for (const jsonFile of TARGET_FILES) {
        const jsonPath = path.join(SOURCES_DIR, jsonFile);
        if (!fs.existsSync(jsonPath)) {
            console.log(`Skipping ${jsonFile} (not found)`);
            continue;
        }

        console.log(`Processing ${jsonFile}...`);
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        let updatedCount = 0;

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            
            // 이미 태그가 충분히 있거나(예: 자동생성됨 표시) 건너뛰고 싶으면 조건 추가 가능
            // 여기서는 기존 태그 뒤에 추가하거나, 비어있으면 채우는 식으로 진행
            // if (item.tag && item.tag.length > 20) continue; 

            // item.file은 'assets/...' 로 시작하므로, 실제 경로는 'public/assets/...' 가 되어야 함
            const imagePath = path.join(ROOT_DIR, 'public', item.file);
            
            if (!fs.existsSync(imagePath)) {
                console.warn(`  [${i + 1}/${data.length}] Image not found: ${item.file} (looked in ${imagePath})`);
                continue;
            }

            try {
                console.log(`  [${i + 1}/${data.length}] Analyzing: ${item.name} (${item.file})`);

                const mimeType = getMimeType(imagePath);
                const imagePart = fileToGenerativePart(imagePath, mimeType);

                const prompt = "Analyze this image and provide 5-10 relevant tags in Korean and English, separated by commas. Focus on visible text, emotions, actions, objects, and famous memes. Just list the tags.";

                // GIF는 Flash 모델, 나머지는 Lite 모델 사용
                const targetModel = mimeType === 'image/gif' ? modelFlash : modelLite;
                const result = await targetModel.generateContent([prompt, imagePart]);
                
                const response = await result.response;
                const text = response.text();
                
                // 태그 정제 (줄바꿈 제거, 앞뒤 공백 제거)
                const newTags = text.replace(/\n/g, ',').split(',').map(t => t.trim()).filter(t => t.length > 0).join(', ');
                
                // 기존 태그 유지하며 추가
                if (item.tag) {
                    item.tag = `${item.tag}, ${newTags}`;
                } else {
                    item.tag = newTags;
                }

                updatedCount++;
                
                // Free Tier Rate Limit: 15 RPM (4초에 1회). 안전하게 5초 대기
                // Pay-as-you-go라면 더 줄여도 됨.
                console.log(`    -> Generated: ${newTags.substring(0, 50)}...`);
                await delay(4000); 

            } catch (error) {
                console.error(`    -> Error generating tags for ${item.file}:`, error.message);
                // 에러 발생 시 잠시 더 대기 (Rate Limit 등)
                await delay(10000);
            }
            
            // 중간 저장 (데이터 유실 방지)
            if (updatedCount % 5 === 0) {
                 fs.writeFileSync(jsonPath, JSON.stringify(data, null, 4), 'utf8');
                 console.log(`    (Saved progress)`);
            }
        }

        // 최종 저장
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 4), 'utf8');
        console.log(`Completed ${jsonFile}. Updated ${updatedCount} items.`);
    }
}

processImages().catch(console.error);
