const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const THUMB_SIZE = 240;

async function generateThumbnail(srcPath, destPath) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    await sharp(srcPath, { animated: false })
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
        .webp({ quality: 82 })
        .toFile(destPath);
    return destPath;
}

module.exports = { generateThumbnail, THUMB_SIZE };
