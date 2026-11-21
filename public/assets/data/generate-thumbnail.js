const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const THUMB_SIZE = 240;

async function generateThumbnail(srcPath, destPath) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    // 움직이는 이미지(GIF·animated webp)는 움직이는 썸네일로. 확장자가 아니라 실제 프레임 수로 판단한다.
    const { pages = 1 } = await sharp(srcPath, { animated: true, limitInputPixels: false }).metadata();
    const animated = pages > 1;
    await sharp(srcPath, { animated, limitInputPixels: false })
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
        .webp({ quality: animated ? 65 : 82 })
        .toFile(destPath);
    return destPath;
}

module.exports = { generateThumbnail, THUMB_SIZE };
