// 원본 이미지(gif/jpg/png/webp) → webp 변환. 사이트는 webp 만 서빙한다 (2026-11-21 오너 결정).
// 실측(짤 324개, 305MB): GIF→animated webp q75 = 24% · PNG→webp q90 = 8% · JPG→webp q80 = 39% · 합계 22%. 화질 차이는 눈으로 구분 안 됨.
// - 움직이는 이미지(프레임 2장 이상)는 애니메이션·프레임 지연·반복을 유지한다
// - JPG 를 q80 으로 다시 압축했는데 원본보다 커지면 q75 로 한 번 더 시도한다 (이미 강하게 압축된 JPG)
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

const QUALITY = { animated: 75, png: 90, jpg: 80, webp: 80, default: 80 };

const md5File = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

async function isAnimated(srcPath) {
    const meta = await sharp(srcPath, { animated: true, limitInputPixels: false }).metadata();
    return (meta.pages || 1) > 1;
}

function kindOf(srcPath) {
    const ext = srcPath.split('.').pop().toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext;
}

async function encode(srcPath, quality, animated) {
    return sharp(srcPath, { animated, limitInputPixels: false })
        .webp({ quality, alphaQuality: 90, effort: 4 })
        .toBuffer();
}

/**
 * srcPath → destPath(.webp). 원본은 지우지 않는다(호출한 쪽이 결정).
 * @returns {{ animated: boolean, md5: string, srcBytes: number, webpBytes: number, quality: number }}
 */
async function convertToWebp(srcPath, destPath) {
    const animated = await isAnimated(srcPath);
    const kind = kindOf(srcPath);
    let quality = animated ? QUALITY.animated : (QUALITY[kind] || QUALITY.default);
    const srcBytes = fs.statSync(srcPath).size;
    let buf = await encode(srcPath, quality, animated);
    if (!animated && kind === 'jpg' && buf.length > srcBytes) {
        quality = 75;
        buf = await encode(srcPath, quality, animated);
    }
    if (!buf.length) throw new Error(`webp 변환 결과가 비었음: ${srcPath}`);
    fs.writeFileSync(destPath, buf);
    return { animated, md5: md5File(srcPath), srcBytes, webpBytes: buf.length, quality };
}

module.exports = { convertToWebp, isAnimated, md5File, QUALITY };
