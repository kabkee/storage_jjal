const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { generateThumbnail, THUMB_SIZE } = require('./generate-thumbnail');

async function run() {
    const tmpDir = path.join(__dirname, '../../../.tmp-smoketest');

    // 정지 이미지(webp 전환된 옛 JPG) → 정사각 정지 webp 썸네일
    const jpgFixture = path.join(__dirname, '../webp/12737a6f-f636-4d47-a4cb-31511a662ff1.webp');
    const jpgOut = path.join(tmpDir, 'thumb.webp');
    await generateThumbnail(jpgFixture, jpgOut);
    assert.ok(fs.existsSync(jpgOut), 'jpg thumbnail was not created');
    const jpgMeta = await sharp(jpgOut).metadata();
    assert.strictEqual(jpgMeta.width, THUMB_SIZE, `expected width ${THUMB_SIZE}, got ${jpgMeta.width}`);
    assert.strictEqual(jpgMeta.height, THUMB_SIZE, `expected height ${THUMB_SIZE}, got ${jpgMeta.height}`);
    assert.strictEqual(jpgMeta.format, 'webp', `expected webp format, got ${jpgMeta.format}`);
    assert.ok(!(jpgMeta.pages > 1), 'still image thumbnail must not be animated');

    // 움직이는 이미지(원본 GIF) → 움직이는 webp 썸네일, 프레임 수 보존.
    // 확장자가 아니라 실제 프레임 수로 판단한다 (움직이는 webp 를 올려도 같은 경로)
    const gifFixture = path.join(__dirname, '../gif/2efb353937ce31638ab5e9bf2c428e88.gif');
    const gifOut = path.join(tmpDir, 'thumb-gif.webp');
    await generateThumbnail(gifFixture, gifOut);
    assert.ok(fs.existsSync(gifOut), 'gif thumbnail was not created');
    const gifSourceMeta = await sharp(gifFixture, { animated: true }).metadata();
    const gifMeta = await sharp(gifOut, { animated: true }).metadata();
    assert.strictEqual(gifMeta.format, 'webp', `expected webp format, got ${gifMeta.format}`);
    assert.strictEqual(gifMeta.pageHeight, THUMB_SIZE, `expected page height ${THUMB_SIZE}, got ${gifMeta.pageHeight}`);
    assert.strictEqual(gifMeta.pages, gifSourceMeta.pages, `expected all ${gifSourceMeta.pages} source frames preserved, got ${gifMeta.pages}`);

    // webp 변환기: 움직이는 이미지는 프레임·지연 시간을 그대로 유지
    const { convertToWebp } = require('./webp-convert');
    const convOut = path.join(tmpDir, 'conv.webp');
    const r = await convertToWebp(gifFixture, convOut);
    assert.strictEqual(r.animated, true, 'animated source must be detected');
    assert.match(r.md5, /^[0-9a-f]{32}$/);
    const convMeta = await sharp(convOut, { animated: true }).metadata();
    assert.strictEqual(convMeta.pages, gifSourceMeta.pages, 'converted webp must keep all frames');
    assert.deepStrictEqual(convMeta.delay, gifSourceMeta.delay, 'converted webp must keep frame delays');

    // 정지 짤은 긴 변 1600px 까지만 (작은 건 키우지 않음) + EXIF 회전 반영
    const { MAX_SIDE } = require('./webp-convert');
    const bigPng = path.join(tmpDir, 'big.png');
    await sharp({ create: { width: 3000, height: 1200, channels: 3, background: '#88aa44' } }).png().toFile(bigPng);
    await convertToWebp(bigPng, path.join(tmpDir, 'big.webp'));
    const bigMeta = await sharp(fs.readFileSync(path.join(tmpDir, 'big.webp'))).metadata();
    assert.deepStrictEqual([bigMeta.width, bigMeta.height], [MAX_SIDE, 640], 'still image must be capped to MAX_SIDE on the long side');
    const rotJpg = path.join(tmpDir, 'rot.jpg');
    await sharp({ create: { width: 400, height: 200, channels: 3, background: '#336699' } }).jpeg().withMetadata({ orientation: 6 }).toFile(rotJpg);
    await convertToWebp(rotJpg, path.join(tmpDir, 'rot.webp'));
    const rotMeta = await sharp(fs.readFileSync(path.join(tmpDir, 'rot.webp'))).metadata();
    assert.deepStrictEqual([rotMeta.width, rotMeta.height], [200, 400], 'EXIF orientation must be applied (phone photos)');

    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('✅ generate-thumbnail smoke test passed');
}

run().catch(err => { console.error('❌ smoke test failed:', err); process.exit(1); });
