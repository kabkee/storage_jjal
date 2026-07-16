const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const THUMB_SIZE = 240;

async function generateThumbnail(srcPath, destPath) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const isGif = path.extname(srcPath).toLowerCase() === '.gif';
    await sharp(srcPath, { animated: isGif })
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
        .webp({ quality: isGif ? 65 : 82 })
        .toFile(destPath);
    return destPath;
}

module.exports = { generateThumbnail, THUMB_SIZE };
