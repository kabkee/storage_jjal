const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { generateThumbnail, THUMB_SIZE } = require('./generate-thumbnail');

async function run() {
    const tmpDir = path.join(__dirname, '../../../.tmp-smoketest');

    // JPG 원본 → 정사각 webp 썸네일
    const jpgFixture = path.join(__dirname, '../jpg/12737a6f-f636-4d47-a4cb-31511a662ff1.jpeg');
    const jpgOut = path.join(tmpDir, 'thumb.webp');
    await generateThumbnail(jpgFixture, jpgOut);
    assert.ok(fs.existsSync(jpgOut), 'jpg thumbnail was not created');
    const jpgMeta = await sharp(jpgOut).metadata();
    assert.strictEqual(jpgMeta.width, THUMB_SIZE, `expected width ${THUMB_SIZE}, got ${jpgMeta.width}`);
    assert.strictEqual(jpgMeta.height, THUMB_SIZE, `expected height ${THUMB_SIZE}, got ${jpgMeta.height}`);
    assert.strictEqual(jpgMeta.format, 'webp', `expected webp format, got ${jpgMeta.format}`);

    // GIF 원본 → 정지 이미지(애니메이션 아님) 썸네일
    const gifFixture = path.join(__dirname, '../gif/2efb353937ce31638ab5e9bf2c428e88.gif');
    const gifOut = path.join(tmpDir, 'thumb-gif.webp');
    await generateThumbnail(gifFixture, gifOut);
    assert.ok(fs.existsSync(gifOut), 'gif thumbnail was not created');
    const gifMeta = await sharp(gifOut).metadata();
    assert.strictEqual(gifMeta.pages, undefined, 'gif thumbnail should be a single static frame, not animated');

    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('✅ generate-thumbnail smoke test passed');
}

run().catch(err => { console.error('❌ smoke test failed:', err); process.exit(1); });
