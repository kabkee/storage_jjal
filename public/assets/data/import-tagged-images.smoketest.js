const assert = require('assert');
const { buildRecord } = require('./import-tagged-images');

const nfdName = '자소서'.normalize('NFD') + '거짓말';
const record = buildRecord({
    id: 999, uuid: 'abc-123', ext: '.jpg', folder: 'jpg',
    name: nfdName, emotion: ['웃김'], situation: ['거절/부정'], tag: '고양이, Cat'
});

assert.strictEqual(record.id, '999', 'id must be stringified');
assert.strictEqual(record.name, nfdName.normalize('NFC'), 'name must be NFC-normalized');
assert.strictEqual(record.file, 'assets/jpg/abc-123.jpg', 'file path must be UUID + folder + ext');
assert.strictEqual(record.thumb, 'assets/thumbs/abc-123.webp', 'thumb path must be UUID.webp under thumbs/');
assert.deepStrictEqual(record.emotion, ['웃김']);
assert.deepStrictEqual(record.situation, ['거절/부정']);

const empty = buildRecord({ id: 1, uuid: 'x', ext: '.png', folder: 'png', name: '', emotion: undefined, situation: undefined, tag: undefined });
assert.deepStrictEqual(empty.emotion, [], 'missing emotion defaults to empty array, not undefined');
assert.deepStrictEqual(empty.situation, [], 'missing situation defaults to empty array, not undefined');

console.log('✅ import-tagged-images buildRecord smoke test passed');
